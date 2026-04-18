"use client";

import { Briefcase, PenTool, Blocks, TerminalSquare } from "lucide-react";

export default function RoleCapabilities() {
  return (
    <>
      {/* Section 5: Role-Based Solutions */}
      <section className="py-12 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 text-sm font-medium text-[#2b6cb0] bg-blue-50/50 border border-blue-100 rounded-full shadow-sm">
              千人千面 • 角色解决方案
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-slate-900 leading-tight">
              <span className="bg-gradient-to-r from-[#2b6cb0] to-indigo-500 text-transparent bg-clip-text">
                为每一个岗位打造专属工作流
              </span>
            </h2>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto">
              不同角色有不同的"齿轮组合"，知阁·舟坊帮你预置最佳实践。
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-12">
            {/* Left: Tabs */}
            <div className="w-full md:w-1/3 flex flex-col gap-2">
              <div className="tab-active p-4 rounded-8 cursor-pointer transition-all">
                <div className="font-bold text-sm mb-1 flex items-center gap-2">
                  <Briefcase className="w-4 h-4" /> 售前专家与大客户经理
                </div>
                <div className="text-xs text-slate-500 ml-6">
                  标书解析、成本预估、方案快速生成
                </div>
              </div>
              <div className="p-4 rounded-8 cursor-pointer hover:bg-slate-50 transition-all">
                <div className="font-bold text-sm mb-1 text-slate-700 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-slate-400" /> 产品经理 (PM)
                </div>
                <div className="text-xs text-slate-500 ml-6">
                  竞品对标、需求对齐、自动化文档
                </div>
              </div>
              <div className="p-4 rounded-8 cursor-pointer hover:bg-slate-50 transition-all text-slate-400">
                <div className="font-bold text-sm mb-1 flex items-center gap-2">
                  <Blocks className="w-4 h-4" /> 系统架构师
                </div>
                <div className="text-xs ml-6">
                  UML 绘图、微服务治理、技术选型建议
                </div>
              </div>
              <div className="p-4 rounded-8 cursor-pointer hover:bg-slate-50 transition-all text-slate-400">
                <div className="font-bold text-sm mb-1 flex items-center gap-2">
                  <TerminalSquare className="w-4 h-4" /> 研发与 QA 团队
                </div>
                <div className="text-xs ml-6">
                  自动化单测、集成测试、代码重构、Diff
                </div>
              </div>
            </div>

            {/* Right: Content */}
            <div className="w-full md:w-2/3 bg-slate-50 rounded-12 p-8 border border-slate-100 flex flex-col justify-between">
              <div>
                <h3 className="text-2xl font-bold mb-2">
                  从标书解析到沙盘，商机转化快人一步
                </h3>
                <p className="text-slate-500 text-sm mb-10">
                  针对大客户复杂的 B 端采购需求，AI 能够在 5 分钟内完成以往 3
                  天的分析与筹备工作。
                </p>

                {/* Steps */}
                <div className="relative flex flex-col md:flex-row gap-6 justify-between mb-8">
                  {/* Step 1 */}
                  <div className="flex-1 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-white border border-[#2b6cb0] text-[#2b6cb0] flex items-center justify-center font-bold text-sm shadow-sm">
                      1
                    </div>
                    <div className="text-sm font-bold">上传标书</div>
                    <p className="text-xs text-slate-400">
                      支持 PDF, Word。AI 自动结构化。
                    </p>
                  </div>
                  {/* Step 2 */}
                  <div className="flex-1 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-[#2b6cb0] text-white flex items-center justify-center font-bold text-sm shadow-md animate-pulse">
                      2
                    </div>
                    <div className="text-sm font-bold">偏离度分析</div>
                    <p className="text-xs text-slate-400 font-medium text-blue-600">
                      正在匹配公司核心能力...
                    </p>
                  </div>
                  {/* Step 3 */}
                  <div className="flex-1 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-300 flex items-center justify-center font-bold text-sm shadow-sm">
                      3
                    </div>
                    <div className="text-sm font-bold">成本精算</div>
                    <p className="text-xs text-slate-400">
                      根据历史驻场测算毛利。
                    </p>
                  </div>
                  {/* Step 4 */}
                  <div className="flex-1 space-y-3">
                    <div className="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-300 flex items-center justify-center font-bold text-sm shadow-sm">
                      4
                    </div>
                    <div className="text-sm font-bold">生成报价</div>
                    <p className="text-xs text-slate-400">
                      输出技术投标建议书。
                    </p>
                  </div>
                </div>
              </div>

              {/* Data Benefit */}
              <div className="pt-6 border-t border-slate-200/60 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-2xl font-bold text-slate-800">x 12</div>
                  <div className="text-xs text-slate-500 mt-1">
                    商机转化效率提升
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">23%</div>
                  <div className="text-xs text-slate-500 mt-1">
                    驻场预估偏差降低
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-slate-800">
                    240
                    <span className="text-sm font-normal text-slate-500">
                      h/月
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    为企业节省人力工时
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
