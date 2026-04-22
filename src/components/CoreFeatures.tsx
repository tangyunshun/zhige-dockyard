"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  FileSearch,
  GitMerge,
  Code,
  Database,
  Layers,
  ArrowRight,
  Briefcase,
  PenTool,
  Blocks,
  TerminalSquare,
} from "lucide-react";

export default function CoreFeatures() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查登录状态
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

  const handleViewComponents = () => {
    if (loading) return;
    
    if (isLoggedIn) {
      // 已登录：跳转到 Studio 组件库页面
      router.push("/studio");
    } else {
      // 未登录：跳转到登录页面
      router.push("/auth/login");
    }
  };

  return (
    <>
      {/* Section 4: Core Component Matrix (Bento Grid) */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 relative">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 text-sm font-medium text-[#2b6cb0] bg-blue-50/50 border border-blue-100 rounded-full shadow-sm">
              核心组件矩阵库
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-slate-900 leading-tight">
              50+ 原子组件，
              <span className="bg-gradient-to-r from-[#2b6cb0] to-indigo-500 text-transparent bg-clip-text">
                覆盖研发全链路
              </span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              从商机挖掘到代码落盘，每一环都有 AI 能力作为"齿轮"驱动，开箱即用。
            </p>

            <div className="mt-8 flex justify-center md:absolute md:right-0 md:bottom-1">
              <button
                onClick={handleViewComponents}
                disabled={loading}
                className={`text-sm font-semibold text-[#2b6cb0] inline-flex items-center gap-1 hover:text-[#2c5282] transition-colors group cursor-pointer bg-transparent border-none p-0 ${
                  loading ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-[#2b6cb0] border-t-transparent rounded-full animate-spin mr-1"></span>
                    加载中...
                  </>
                ) : (
                  <>
                    查看完整组件库{" "}
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Main Card: Bidding - 左侧大卡片 */}
            <div className="md:col-span-2 bento-card rounded-12 p-6 flex flex-col gap-4">
              <div>
                <div className="w-10 h-10 bg-blue-50 rounded-8 flex items-center justify-center text-[#2b6cb0] mb-4">
                  <FileSearch className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">商机与标书拆解</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  秒级解析 PDF/Docx 标书，自动提取偏离表与关键技术指标。
                </p>
              </div>
              <div className="bg-slate-50 rounded-8 border border-slate-100 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-mono text-slate-400">
                    RFP_ANALYSIS_V2.PDF
                  </div>
                  <div className="text-xs text-[#2b6cb0] font-semibold">
                    89% 已解析
                  </div>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#2b6cb0] h-full w-[89%]"></div>
                </div>
              </div>
            </div>

            {/* Right Column - 右侧三张小卡片 */}
            <div className="flex flex-col gap-6">
              {/* Small Card 1: Code Diff */}
              <div className="rounded-12 p-5 flex flex-col bg-black text-white border border-slate-200/10 flex-1">
                <div className="mb-3 text-emerald-400">
                  <Code className="w-5 h-5" />
                </div>
                <h3 className="font-bold mb-1 text-sm">代码高亮对比</h3>
                <p className="text-slate-400 text-xs mb-3">
                  AI 自动评审代码变更，预警逻辑漏洞。
                </p>
                <div className="mt-auto font-mono text-[9px] space-y-1 bg-slate-900/50 rounded-4 p-2">
                  <div className="text-red-400">- return count * price;</div>
                  <div className="text-emerald-400">
                    + return applyDiscount(count * price);
                  </div>
                </div>
              </div>

              {/* Small Card 2: ER Diagram */}
              <div className="bento-card rounded-12 p-5 flex flex-col flex-1">
                <div className="mb-3 text-amber-500">
                  <Database className="w-5 h-5" />
                </div>
                <h3 className="font-bold mb-1 text-sm text-slate-900">
                  数据库逆向 ER 图
                </h3>
                <p className="text-slate-500 text-xs mb-3">
                  根据 PRD 或遗留代码，反向推导物理表结构。
                </p>
                <div className="mt-auto flex gap-2">
                  <div className="w-full h-10 border border-dashed border-slate-200 rounded-4 flex items-center justify-center">
                    <Layers className="w-4 h-4 text-slate-300" />
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Row - 下方两个卡片 */}
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* High Card: PRD */}
              <div className="bento-card rounded-12 p-6 flex flex-col justify-between bg-gradient-to-br from-white to-blue-50/30">
                <div>
                  <div className="w-10 h-10 bg-indigo-50 rounded-8 flex items-center justify-center text-indigo-500 mb-4">
                    <GitMerge className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-bold mb-2">混沌需求转 PRD</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    捕捉对话中的碎片想法，通过思维链 (CoT)
                    自动补齐业务边界，生成标准的 PRD 与原型草图。
                  </p>
                </div>
                <div className="space-y-2 mt-4">
                  <div className="bg-white p-2.5 rounded-8 shadow-sm text-xs border border-slate-100 italic text-slate-400">
                    "我们需要一个支持离线工作的 CRM 系统..."
                  </div>
                  <div className="bg-indigo-500 text-white p-2.5 rounded-8 shadow-sm text-xs font-medium ml-3">
                    正在推导：数据一致性协议、离线缓存策略...
                  </div>
                </div>
              </div>

              {/* Small Card 3: API Contract */}
              <div className="bento-card rounded-12 p-6 flex flex-col">
                <div className="mb-4 text-rose-500">
                  <Layers className="w-6 h-6" />
                </div>
                <h3 className="font-bold mb-1 text-slate-900">
                  自动化 API 契约
                </h3>
                <p className="text-slate-500 text-sm mb-4">
                  生成符合 OpenAPI 3.0 的接口定义。
                </p>
                <div className="mt-auto bg-slate-50 p-3 rounded-8 font-mono text-[10px] text-slate-400">
                  {`{ "status": "200", "data": {...} }`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
