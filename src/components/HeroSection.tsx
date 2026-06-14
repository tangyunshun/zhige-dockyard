"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  CornerDownLeft,
  ArrowRight,
  ShieldCheck,
  Workflow,
  BarChart3,
  Users,
  Lightbulb,
  AlertCircle,
  FileText,
  Database,
  Layers,
  Code
} from "lucide-react";

interface HeroSectionProps {
  onDemoRequest?: () => void;
}

type SandboxType = "tender" | "prd" | "arch" | "er" | "diff";

export default function HeroSection({ onDemoRequest }: HeroSectionProps) {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // 交互沙箱状态
  const [currentSandbox, setCurrentSandbox] = useState<SandboxType>("arch");
  const [inputText, setInputText] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);

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
      router.push(`/auth/login?redirect=${encodeURIComponent(targetPath)}`);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isSimulating) return;
    setInputText(suggestion);
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      if (suggestion === "提取标书偏离表") {
        setCurrentSandbox("tender");
      } else if (suggestion === "生成 PRD 文档") {
        setCurrentSandbox("prd");
      } else if (suggestion === "对比代码 Diff") {
        setCurrentSandbox("diff");
      } else if (suggestion === "逆向数据库 ER 图") {
        setCurrentSandbox("er");
      }
    }, 500);
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = inputText.trim();
    if (!query) return;
    router.push(`/capabilities?search=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <section className="relative pt-32 pb-20 px-6 overflow-hidden bg-gradient-to-br from-[#eaf4fc] via-[#f0f8ff] to-[#e6f4f1]">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200/50 text-[#3182ce] text-xs font-semibold mb-8 animate-fade-in shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3182ce]"></span>
            </span>
            V5.0 全新发布:50+ 效能组件引擎上线
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-[#3182ce] via-[#2563eb] to-[#1e40af] bg-clip-text text-transparent leading-[1.15] mb-6">
            重塑软件工程:
            <br />
            全链路效能操作系统
          </h1>

          <p className="text-base md:text-lg text-slate-500 max-w-3xl mx-auto mb-8 leading-relaxed">
            打破工具孤岛，从 RFP 标书解析到系统架构、PRD 生成、项目验收，提效{" "}
            <span className="text-[#3182ce] font-semibold">300%</span>。
          </p>

          {/* 交互输入模拟器 */}
          <div className="max-w-2xl mx-auto mb-12">
            <form
              onSubmit={handleSearchSubmit}
              className="spotlight-input relative flex items-center bg-white/80 backdrop-blur-sm border border-slate-200/60 p-1.5 rounded-xl transition-all group shadow-lg shadow-slate-200/50 focus-within:border-[#3182ce]/50 focus-within:shadow-[#3182ce]/10"
            >
              <div className="pl-3 text-[#3182ce]">
                <Lightbulb className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="尝试输入：解析《政务云二期标书.pdf》并生成微服务架构图..."
                className="w-full px-3 py-2 bg-transparent border-none focus:ring-0 text-slate-700 outline-none text-sm md:text-base"
              />
              <button
                type="submit"
                className="bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white p-2 rounded-lg hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all cursor-pointer flex items-center justify-center"
              >
                <CornerDownLeft className="w-4 h-4" />
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-4 text-sm">
              <span className="text-slate-400 font-medium mr-1">试试:</span>
              <button
                type="button"
                onClick={() => handleSuggestionClick("提取标书偏离表")}
                className={`px-3 py-1.5 rounded-full border cursor-pointer transition-all text-xs font-semibold shadow-sm ${
                  currentSandbox === "tender"
                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                    : "bg-white/80 text-slate-600 border-slate-200/60 hover:bg-slate-50 hover:text-[#3182ce] hover:border-[#3182ce]/30"
                }`}
              >
                提取标书偏离表
              </button>
              <button
                type="button"
                onClick={() => handleSuggestionClick("生成 PRD 文档")}
                className={`px-3 py-1.5 rounded-full border cursor-pointer transition-all text-xs font-semibold shadow-sm ${
                  currentSandbox === "prd"
                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                    : "bg-white/80 text-slate-600 border-slate-200/60 hover:bg-slate-50 hover:text-[#3182ce] hover:border-[#3182ce]/30"
                }`}
              >
                生成 PRD 文档
              </button>
              <button
                type="button"
                onClick={() => handleSuggestionClick("对比代码 Diff")}
                className={`px-3 py-1.5 rounded-full border cursor-pointer transition-all text-xs font-semibold shadow-sm ${
                  currentSandbox === "diff"
                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                    : "bg-white/80 text-slate-600 border-slate-200/60 hover:bg-slate-50 hover:text-[#3182ce] hover:border-[#3182ce]/30"
                }`}
              >
                对比代码 Diff
              </button>
              <button
                type="button"
                onClick={() => handleSuggestionClick("逆向数据库 ER 图")}
                className={`px-3 py-1.5 rounded-full border cursor-pointer transition-all text-xs font-semibold shadow-sm ${
                  currentSandbox === "er"
                    ? "bg-[#3182ce] text-white border-[#3182ce]"
                    : "bg-white/80 text-slate-600 border-slate-200/60 hover:bg-slate-50 hover:text-[#3182ce] hover:border-[#3182ce]/30"
                }`}
              >
                逆向数据库 ER 图
              </button>
            </div>
          </div>

          {/* Workbench 仿真模拟 */}
          <div className="mockup-container mt-12 relative">
            <div className="mockup-content relative mx-auto max-w-5xl">
              <div className="absolute -top-10 -left-10 w-full h-full bg-slate-900 rounded-12 shadow-2xl opacity-40 border border-slate-700 transform translate-z-[-20px]"></div>

              <div className="relative bg-white rounded-12 shadow-2xl border border-slate-200 overflow-hidden">
                {isSimulating && (
                  <div className="absolute inset-0 z-30 bg-slate-900/40 backdrop-blur-[4px] flex flex-col items-center justify-center transition-all duration-300">
                    <div className="bg-white p-6 rounded-[20px] shadow-2xl border border-slate-100 flex flex-col items-center gap-3 max-w-xs text-center animate-fade-in">
                      <div className="w-10 h-10 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin" />
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">舟坊 AI 引擎提取中</h4>
                        <p className="text-[10px] text-slate-500 mt-1">正在模拟推演效能组件沙盘...</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="absolute right-4 bottom-4 bg-slate-900/80 text-white text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1 shadow-lg pointer-events-none animate-pulse md:hidden z-20">
                  <span>👈 左右滑动预览 👉</span>
                </div>

                {/* 模拟浏览器头部 */}
                <div className="h-12 border-b border-slate-100 flex items-center px-4 gap-4 bg-white">
                  <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                  </div>
                  <div className="flex-1 flex px-4">
                    <div className="bg-white border border-slate-200 rounded-full flex items-center px-4 py-1.5 text-xs text-slate-500 shadow-sm w-full max-w-lg mx-auto md:ml-4 md:mr-auto">
                      <div className="w-2 h-2 rounded-full bg-[#3182ce] mr-2 animate-pulse"></div>
                      app.zhige.os / workbench / project-demo-sandbox
                    </div>
                  </div>
                </div>

                {/* 工作台主体 */}
                <div className="overflow-x-auto scrollbar-thin">
                  <div className="flex w-full min-w-[800px] h-[520px] bg-white text-left">
                    {/* 左侧菜单 */}
                    <div className="w-48 border-r border-slate-100 p-6 flex flex-col gap-3">
                      <div className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">
                        工作流链路
                      </div>

                      <button
                        type="button"
                        onClick={() => setCurrentSandbox("tender")}
                        className={`flex items-center gap-3 text-sm font-semibold px-3 py-2 rounded-lg text-left transition-all w-full cursor-pointer ${
                          currentSandbox === "tender"
                            ? "text-[#3182ce] bg-blue-50/70"
                            : "text-slate-600 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentSandbox === "tender" ? "bg-[#3182ce]" : "bg-slate-350"}`}></div>
                        标书解析
                      </button>

                      <button
                        type="button"
                        onClick={() => setCurrentSandbox("prd")}
                        className={`flex items-center gap-3 text-sm font-semibold px-3 py-2 rounded-lg text-left transition-all w-full cursor-pointer ${
                          currentSandbox === "prd"
                            ? "text-[#3182ce] bg-blue-50/70"
                            : "text-slate-600 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentSandbox === "prd" ? "bg-[#3182ce]" : "bg-slate-350"}`}></div>
                        需求转 PRD
                      </button>

                      <button
                        type="button"
                        onClick={() => setCurrentSandbox("arch")}
                        className={`flex items-center gap-3 text-sm font-semibold px-3 py-2 rounded-lg text-left transition-all w-full cursor-pointer ${
                          currentSandbox === "arch"
                            ? "text-[#3182ce] bg-blue-50/70"
                            : "text-slate-600 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentSandbox === "arch" ? "bg-[#3182ce]" : "bg-slate-350"}`}></div>
                        架构设计
                      </button>

                      <button
                        type="button"
                        onClick={() => setCurrentSandbox("er")}
                        className={`flex items-center gap-3 text-sm font-semibold px-3 py-2 rounded-lg text-left transition-all w-full cursor-pointer ${
                          currentSandbox === "er"
                            ? "text-[#3182ce] bg-blue-50/70"
                            : "text-slate-600 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentSandbox === "er" ? "bg-[#3182ce]" : "bg-slate-350"}`}></div>
                        ER 图生成
                      </button>

                      <button
                        type="button"
                        onClick={() => setCurrentSandbox("diff")}
                        className={`flex items-center gap-3 text-sm font-semibold px-3 py-2 rounded-lg text-left transition-all w-full cursor-pointer ${
                          currentSandbox === "diff"
                            ? "text-[#3182ce] bg-blue-50/70"
                            : "text-slate-600 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${currentSandbox === "diff" ? "bg-[#3182ce]" : "bg-slate-350"}`}></div>
                        代码对比
                      </button>
                    </div>

                    {/* 中间主要视图区 */}
                    <div className="flex-1 flex flex-col p-8 relative overflow-y-auto">
                      
                      {/* 1. 架构图预览 */}
                      {currentSandbox === "arch" && (
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                系统架构图 <span className="text-slate-300">•</span> v1.2
                              </h2>
                              <p className="text-xs text-slate-500 mt-1">自动生成 • 12 服务节点 • 24 链路</p>
                            </div>
                            <div className="flex bg-slate-50 border border-slate-100 rounded-lg p-1">
                              <span className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-md shadow-sm">画布</span>
                              <span className="px-4 py-1.5 text-slate-600 text-xs font-medium hover:bg-slate-100 rounded-md transition-colors cursor-pointer">代码</span>
                              <span className="px-4 py-1.5 text-slate-600 text-xs font-medium hover:bg-slate-100 rounded-md transition-colors cursor-pointer">预览</span>
                            </div>
                          </div>
                          <div className="flex-1 flex items-center justify-center relative my-4">
                            <div className="relative w-full max-w-sm h-52">
                              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
                                <line x1="20%" y1="20%" x2="50%" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1="50%" y1="20%" x2="50%" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1="80%" y1="20%" x2="50%" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1="20%" y1="80%" x2="50%" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1="50%" y1="80%" x2="50%" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
                                <line x1="80%" y1="80%" x2="50%" y2="50%" stroke="#cbd5e1" strokeWidth="1.5" />
                              </svg>
                              <div className="absolute top-[10%] left-[10%] px-4 py-1.5 bg-white border border-[#3182ce] text-[#3182ce] text-[10px] font-bold rounded-lg shadow-sm z-10 w-20 text-center">Web</div>
                              <div className="absolute top-[10%] left-[50%] -translate-x-1/2 px-4 py-1.5 bg-white border border-[#3182ce] text-[#3182ce] text-[10px] font-bold rounded-lg shadow-sm z-10 w-20 text-center">Mobile</div>
                              <div className="absolute top-[10%] right-[10%] px-4 py-1.5 bg-white border border-purple-400 text-purple-600 text-[10px] font-bold rounded-lg shadow-sm z-10 w-24 text-center">API GW</div>
                              <div className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 px-4 py-2 bg-[#3182ce] text-white text-[10px] font-bold rounded-lg shadow-md z-10 w-28 text-center tracking-wide">Service Mesh</div>
                              <div className="absolute bottom-[10%] left-[10%] px-4 py-1.5 bg-white border border-[#3182ce] text-[#3182ce] text-[10px] font-bold rounded-lg shadow-sm z-10 w-20 text-center">Auth</div>
                              <div className="absolute bottom-[10%] left-[50%] -translate-x-1/2 px-4 py-1.5 bg-white border border-[#3182ce] text-[#3182ce] text-[10px] font-bold rounded-lg shadow-sm z-10 w-20 text-center">Order</div>
                              <div className="absolute bottom-[10%] right-[10%] px-4 py-1.5 bg-white border border-[#3182ce] text-[#3182ce] text-[10px] font-bold rounded-lg shadow-sm z-10 w-20 text-center">Data</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. 标书解析 */}
                      {currentSandbox === "tender" && (
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="mb-4">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              标书技术指标解析与偏离表 <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[10px] font-bold">已检测到1项偏离</span>
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">解析文件：招标说明书_政务云二期建设项目.pdf</p>
                          </div>
                          <div className="flex-1 border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50 p-2 text-xs">
                            <div className="grid grid-cols-12 bg-white border border-slate-150 rounded-lg font-bold py-2 px-3 text-slate-700 shadow-sm mb-2">
                              <div className="col-span-4">招标规格条款</div>
                              <div className="col-span-2 text-center">偏离匹配</div>
                              <div className="col-span-6">知阁舟坊技术应答及系统对标建议</div>
                            </div>
                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                              <div className="grid grid-cols-12 bg-white border border-slate-100 rounded-lg py-2 px-3 items-center">
                                <div className="col-span-4 text-slate-800 font-semibold">1. 核心接口耗时 ≤ 100ms</div>
                                <div className="col-span-2 text-center text-emerald-600 font-bold">✓ 无偏离</div>
                                <div className="col-span-6 text-slate-500">自研网关提供核心路由与高性能缓存，核心接口响应均在30ms内。</div>
                              </div>
                              <div className="grid grid-cols-12 bg-white border border-slate-100 rounded-lg py-2 px-3 items-center">
                                <div className="col-span-4 text-slate-800 font-semibold">2. 必须具备物理隔离私有化部署</div>
                                <div className="col-span-2 text-center text-emerald-600 font-bold">✓ 无偏离</div>
                                <div className="col-span-6 text-slate-500">系统完全解耦，支持专网物理单机包及VPC隔离环境离线一键部署。</div>
                              </div>
                              <div className="grid grid-cols-12 bg-white border border-red-100 bg-red-50/10 rounded-lg py-2 px-3 items-center">
                                <div className="col-span-4 text-red-700 font-semibold">3. 系统需内置大型大语言模型</div>
                                <div className="col-span-2 text-center text-red-600 font-bold">! 建议偏离</div>
                                <div className="col-span-6 text-slate-600 font-medium">不提供公网SAAS大模型，建议应答为：完美对接本地私有化DeepSeek算力集群。</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3. 需求转 PRD */}
                      {currentSandbox === "prd" && (
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="mb-4">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              智能自动补齐 PRD 文档
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">脑图输入源：用户提到“支持冷静期并在注销时有撤销按钮”</p>
                          </div>
                          <div className="flex-1 border border-slate-200/80 rounded-xl bg-slate-50/50 p-4 font-mono text-[11px] text-slate-700 overflow-y-auto max-h-[260px] space-y-4 shadow-inner">
                            <div>
                              <span className="text-[#3182ce] font-bold"># 1. 核心用例：冷静期及注销撤销</span>
                              <p className="pl-3 mt-1 text-slate-600 leading-relaxed">
                                1.1 用户在前台点击“注销账号”，系统将用户 status 变更为 `deleting` 并触发 7 天冷静计时器。<br />
                                1.2 冷静期内用户再次登录时，系统必须强制弹出“注销冷静期提醒模态框”，并显示实时倒计时。<br />
                                1.3 提醒模态框需包含“撤销注销”和“退出登录”两个操作入口，撤销注销后数据立刻无损还原。
                              </p>
                            </div>
                            <div>
                              <span className="text-[#3182ce] font-bold"># 2. 安全性与多标签同步（智能追加）</span>
                              <p className="pl-3 mt-1 text-slate-600 leading-relaxed">
                                2.1 安全机制：删除行为需调用 `localStorage.clear()` 和 `sessionStorage.clear()` 防止会话污染。<br />
                                2.2 多端联动：使用同步监听器，一旦注销，将同时清理当前设备所有打开的标签页会话信息。
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4. ER 图生成 */}
                      {currentSandbox === "er" && (
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="mb-4">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              逆向推导物理 ERD 结构
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">引擎配置：PostgreSQL • 自动优化外键联合索引</p>
                          </div>
                          <div className="flex-1 flex items-center justify-center gap-8 bg-slate-50/30 border border-slate-100 rounded-xl p-4 min-h-[220px]">
                            {/* users table */}
                            <div className="border border-slate-200 rounded-xl bg-white shadow-sm w-36 overflow-hidden text-[11px]">
                              <div className="bg-blue-50 border-b border-slate-200 px-3 py-1.5 font-bold text-blue-700">users</div>
                              <div className="p-2.5 space-y-1 font-mono text-slate-500">
                                <div>🔑 id : int</div>
                                <div>📧 email : varchar</div>
                                <div>⚙️ status : varchar</div>
                              </div>
                            </div>

                            <div className="flex flex-col items-center">
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">1:N 关联</span>
                              <span className="text-slate-300 text-lg">─────────</span>
                            </div>

                            {/* workspaces table */}
                            <div className="border border-slate-200 rounded-xl bg-white shadow-sm w-40 overflow-hidden text-[11px]">
                              <div className="bg-purple-50 border-b border-slate-200 px-3 py-1.5 font-bold text-purple-700">workspaces</div>
                              <div className="p-2.5 space-y-1 font-mono text-slate-500">
                                <div>🔑 id : int</div>
                                <div>👤 owner_id : int (FK)</div>
                                <div>📝 name : varchar</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 5. 代码对比 */}
                      {currentSandbox === "diff" && (
                        <div className="flex-1 flex flex-col justify-between">
                          <div className="mb-4">
                            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                              代码高亮对比 & 逻辑评审
                            </h2>
                            <p className="text-xs text-slate-500 mt-1">自动识别代码变更，检测逻辑漏洞并提供重构建议</p>
                          </div>
                          <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-[#0f172a] text-white p-4 font-mono text-[11px] max-h-[220px] overflow-y-auto shadow-inner">
                            <div className="text-slate-500 mb-2">// OrderService.java - applyDiscount 方法</div>
                            <div className="text-red-400 bg-red-950/20 px-2 py-0.5">- return count * price;</div>
                            <div className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5">+ double rawTotal = count * price;</div>
                            <div className="text-emerald-400 bg-emerald-950/20 px-2 py-0.5">+ return applyDiscount(rawTotal, userMembership);</div>
                            <div className="text-slate-500 mt-4">// AI 自动审计分析建议：</div>
                            <div className="text-amber-400 px-2">⚠️ 检测到原逻辑存在漏算折扣的业务逻辑偏差风险，已修正为调用会员折扣逻辑。</div>
                          </div>
                        </div>
                      )}

                      {/* 底部指标展示 */}
                      <div className="grid grid-cols-4 gap-4 mt-6">
                        {currentSandbox === "arch" && (
                          <>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">服务节点</div>
                              <div className="text-base font-bold text-slate-800">12</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">耦合度</div>
                              <div className="text-base font-bold text-slate-800">低</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">QPS 预估</div>
                              <div className="text-base font-bold text-slate-800">8.2k</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">合规</div>
                              <div className="text-base font-bold text-emerald-600">✓</div>
                            </div>
                          </>
                        )}
                        {currentSandbox === "tender" && (
                          <>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">标书总数</div>
                              <div className="text-base font-bold text-slate-800">48 页</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">条款解析</div>
                              <div className="text-base font-bold text-slate-800">140 项</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">偏离条款</div>
                              <div className="text-base font-bold text-red-500">1 项</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">推荐度</div>
                              <div className="text-base font-bold text-[#3182ce]">95%</div>
                            </div>
                          </>
                        )}
                        {currentSandbox === "prd" && (
                          <>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">生成用例</div>
                              <div className="text-base font-bold text-slate-800">24 个</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">业务复杂度</div>
                              <div className="text-base font-bold text-slate-800">中等</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">补全边界</div>
                              <div className="text-base font-bold text-[#3182ce]">8 处</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">耗时节省</div>
                              <div className="text-base font-bold text-emerald-600">92%</div>
                            </div>
                          </>
                        )}
                        {currentSandbox === "er" && (
                          <>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">推导表数</div>
                              <div className="text-base font-bold text-slate-800">6 个</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">关联关系</div>
                              <div className="text-base font-bold text-slate-800">5 处</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">索引优化</div>
                              <div className="text-base font-bold text-emerald-600">2 建议</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">兼容性</div>
                              <div className="text-base font-bold text-slate-800">多引擎</div>
                            </div>
                          </>
                        )}
                        {currentSandbox === "diff" && (
                          <>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">变更行数</div>
                              <div className="text-base font-bold text-slate-800">+2 / -1</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">逻辑风险</div>
                              <div className="text-base font-bold text-emerald-600">0 警告</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">单元测试</div>
                              <div className="text-base font-bold text-emerald-600">✓ 已覆盖</div>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 flex flex-col justify-center text-center">
                              <div className="text-[9px] font-medium text-slate-400 mb-0.5">代码合规</div>
                              <div className="text-base font-bold text-slate-800">符合规范</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 右侧助手小面板 */}
                    <div className="w-72 border-l border-slate-100 p-6 flex flex-col bg-slate-50/50">
                      <div className="flex items-center gap-2.5 mb-6">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#3182ce] to-indigo-500 shadow-inner flex items-center justify-center text-white">
                          <Workflow className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-slate-800 text-sm tracking-wide">
                          智能架构助手
                        </span>
                      </div>

                      {currentSandbox === "arch" && (
                        <>
                          <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed mb-4">
                            已识别 <span className="font-bold text-[#3182ce]">127 项</span> 功能点，正在生成服务边界...
                          </div>
                          <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed mb-6">
                            建议将 <span className="text-[#3182ce] font-semibold">UserService</span> 与 <span className="text-[#3182ce] font-semibold">AuthService</span> 合并，以降低网关链路耗时。
                          </div>
                        </>
                      )}

                      {currentSandbox === "tender" && (
                        <>
                          <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed mb-4">
                            标书内容《政务云二期建设项目》解析成功。
                          </div>
                          <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed mb-6">
                            检测到 <span className="text-red-600 font-bold">1项</span> 技术规格偏离（大语言模型集成要求），建议应答方案已生成。
                          </div>
                        </>
                      )}

                      {currentSandbox === "prd" && (
                        <>
                          <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed mb-4">
                            根据碎片脑图提取的“冷静期与账号注销”需求文档整理完毕。
                          </div>
                          <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed mb-6">
                            AI 已自动追加关于 <span className="text-[#3182ce] font-semibold">“多标签页注销同步清除”</span> 的系统非功能性需求条款。
                          </div>
                        </>
                      )}

                      {currentSandbox === "er" && (
                        <>
                          <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed mb-4">
                            根据工作流用例，已逆向产出核心物理表结构草稿。
                          </div>
                          <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed mb-6">
                            建议在 <span className="text-[#3182ce] font-semibold">workspaces.owner_id</span> 字段建立联合索引，提升检索效率 40%。
                          </div>
                        </>
                      )}

                      {currentSandbox === "diff" && (
                        <>
                          <div className="bg-white rounded-12 p-4 shadow-sm border border-slate-100 text-xs text-slate-600 leading-relaxed mb-4">
                            代码变更自动审计分析完成，建议合并当前代码。
                          </div>
                          <div className="bg-blue-50/70 rounded-12 p-4 border border-blue-100 text-xs text-slate-700 leading-relaxed mb-6">
                            已检测并自动补齐 <span className="text-[#3182ce] font-semibold">OrderServiceTest</span> 的单元测试代码覆盖。
                          </div>
                        </>
                      )}

                      {/* 进度指示条 */}
                      <div className="mt-auto space-y-4 pt-4 border-t border-slate-100">
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                            <span>标书解析进度</span>
                            <span>{currentSandbox === "tender" || currentSandbox === "prd" || currentSandbox === "arch" || currentSandbox === "er" || currentSandbox === "diff" ? "100%" : "0%"}</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-[#3182ce] to-indigo-400 h-full transition-all duration-500" style={{ width: currentSandbox === "tender" || currentSandbox === "prd" || currentSandbox === "arch" || currentSandbox === "er" || currentSandbox === "diff" ? "100%" : "0%" }}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                            <span>需求文档补全</span>
                            <span>{currentSandbox === "prd" || currentSandbox === "arch" || currentSandbox === "er" || currentSandbox === "diff" ? "100%" : currentSandbox === "tender" ? "0%" : "0%"}</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-[#3182ce] to-indigo-400 h-full transition-all duration-500" style={{ width: currentSandbox === "prd" || currentSandbox === "arch" || currentSandbox === "er" || currentSandbox === "diff" ? "100%" : "0%" }}></div>
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                            <span>微服务架构生成</span>
                            <span>{currentSandbox === "arch" ? "72%" : currentSandbox === "er" ? "90%" : currentSandbox === "prd" ? "45%" : currentSandbox === "diff" ? "95%" : "0%"}</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-[#3182ce] to-indigo-400 h-full transition-all duration-500" style={{ width: currentSandbox === "arch" ? "72%" : currentSandbox === "er" ? "90%" : currentSandbox === "prd" ? "45%" : currentSandbox === "diff" ? "95%" : "0%" }}></div>
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

      {/* 核心指标统计区 */}
      <section className="py-24 bg-gradient-to-b from-[#eaf4fc] to-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
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
        </div>
      </section>
    </>
  );
}