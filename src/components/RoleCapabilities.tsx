"use client";

import { useState } from "react";
import { Briefcase, PenTool, Blocks, TerminalSquare, ArrowRight } from "lucide-react";

type RoleType = "sales" | "pm" | "architect" | "dev_qa";

interface WorkflowStep {
  label: string;
  desc: string;
}

interface RoleData {
  title: string;
  subtitle: string;
  steps: WorkflowStep[];
  activeStep: number;
  highlightText: string;
  metrics: {
    val: string;
    label: string;
  }[];
}

export default function RoleCapabilities() {
  const [activeRole, setActiveRole] = useState<RoleType>("sales");

  const rolesContent: Record<RoleType, RoleData> = {
    sales: {
      title: "从标书解析到沙盘，商机转化快人一步",
      subtitle: "针对大客户复杂的 B 端采购需求，能够在 5 分钟内完成以往 3 天的分析与筹备工作。",
      activeStep: 1, // 0-indexed, step 2 (偏离度分析)
      highlightText: "正在匹配公司核心能力...",
      steps: [
        { label: "上传标书", desc: "支持 PDF, Word。自动结构化。" },
        { label: "偏离度分析", desc: "智能对比系统匹配度与偏离项。" },
        { label: "成本精算", desc: "基于历史数据自动核算人月毛利。" },
        { label: "生成报价", desc: "输出标准技术投标应答建议书。" }
      ],
      metrics: [
        { val: "x 12", label: "商机转化效率提升" },
        { val: "23%", label: "驻场预算偏差降低" },
        { val: "240h/月", label: "为企业节省人力工时" }
      ]
    },
    pm: {
      title: "混沌想法智能补全，需求转 PRD 一步到位",
      subtitle: "免去手动撰写繁杂文档，AI 帮您补齐异常流逻辑、安全限制以及多标签状态同步规则。",
      activeStep: 1, // step 2 (边界补齐)
      highlightText: "正在推导系统非功能性需求...",
      steps: [
        { label: "录入想法", desc: "自由录入碎片需求或原始脑图。" },
        { label: "边界补全", desc: "AI 智能自动补充业务逻辑漏洞。" },
        { label: "原型生成", desc: "根据功能描述渲染低保真草图。" },
        { label: "PRD 导出", desc: "一键导出 Markdown 格式的 PRD。" }
      ],
      metrics: [
        { val: "85%", label: "PRD 撰写耗时缩短" },
        { val: "60%", label: "业务逻辑漏洞降低" },
        { val: "45%", label: "需求评审一次通过率" }
      ]
    },
    architect: {
      title: "物理表结构逆向推导，微服务边界一键拆分",
      subtitle: "分析已有数据库结构或用例，推荐高内聚低耦合的微服务节点规划与标准的 OpenAPI 契约。",
      activeStep: 2, // step 3 (接口建模)
      highlightText: "正在生成符合 OpenAPI 规范接口...",
      steps: [
        { label: "逆向工程", desc: "一键分析遗留代码或数据表 Schema。" },
        { label: "服务拆分", desc: "基于领域模型自动划分服务边界。" },
        { label: "接口建模", desc: "生成符合规范的 API 契约结构。" },
        { label: "沙盘推演", desc: "模拟高并发负载下的调用延迟。" }
      ],
      metrics: [
        { val: "x 8", label: "系统架构设计效率提升" },
        { val: "100%", label: "API 接口契约一致性" },
        { val: "35%", label: "微服务网格依赖度降低" }
      ]
    },
    dev_qa: {
      title: "自动生成全路径单测，混沌异常秒级修复",
      subtitle: "代码落地时自动配齐单元测试与构建静态扫描，在部署前拦截潜在逻辑漏洞并生成 Diff 报告。",
      activeStep: 1, // step 2 (单测生成)
      highlightText: "全路径代码覆盖扫描中...",
      steps: [
        { label: "代码手脚架", desc: "根据 API 契约一键生成后端骨架。" },
        { label: "单测生成", desc: "自动编写覆盖异常路径的单测。" },
        { label: "缺陷拦截", desc: "静态分析常见逻辑死锁与漏洞。" },
        { label: "交付 Diff", desc: "提供详细的代码对比与热部署。" }
      ],
      metrics: [
        { val: "90%+", label: "单元测试全路径覆盖率" },
        { val: "70%", label: "部署与集成周期缩短" },
        { val: "x 5", label: "线上缺陷定位与修复效率" }
      ]
    }
  };

  const currentData = rolesContent[activeRole];

  return (
    <>
      <section className="py-20 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 text-sm font-bold text-[#3182ce] bg-gradient-to-r from-blue-50 to-blue-100/50 border border-blue-200/50 rounded-full shadow-sm">
              千人千面 • 角色解决方案
            </div>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight text-slate-900 leading-tight">
              <span className="bg-gradient-to-r from-[#3182ce] via-[#2563eb] to-[#1e40af] text-transparent bg-clip-text">
                为每一个岗位打造专属工作流
              </span>
            </h2>
            <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
              不同角色有不同的“效能齿轮组合”，知阁·舟坊为您开箱预置最佳实践。
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 items-stretch">
            {/* 左侧选择器 */}
            <div className="w-full md:w-1/3 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => setActiveRole("sales")}
                className={`zg-card p-5 cursor-pointer text-left transition-all ${
                  activeRole === "sales"
                    ? "bg-gradient-to-br from-blue-50/80 to-white border-[#3182ce]/40 shadow-md translate-x-1"
                    : "bg-white/40 border-slate-200/60 hover:bg-slate-50/50"
                }`}
              >
                <div className={`font-bold text-sm mb-1.5 flex items-center gap-2.5 ${activeRole === "sales" ? "text-[#3182ce]" : "text-slate-800"}`}>
                  <Briefcase className={`w-4 h-4 ${activeRole === "sales" ? "text-[#3182ce]" : "text-slate-400"}`} />
                  售前专家与大客户经理
                </div>
                <div className="text-xs text-slate-500 ml-6.5 leading-relaxed">
                  标书自动拆解、成本利润精算、报价与应答书生成
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveRole("pm")}
                className={`zg-card p-5 cursor-pointer text-left transition-all ${
                  activeRole === "pm"
                    ? "bg-gradient-to-br from-blue-50/80 to-white border-[#3182ce]/40 shadow-md translate-x-1"
                    : "bg-white/40 border-slate-200/60 hover:bg-slate-50/50"
                }`}
              >
                <div className={`font-bold text-sm mb-1.5 flex items-center gap-2.5 ${activeRole === "pm" ? "text-[#3182ce]" : "text-slate-800"}`}>
                  <PenTool className={`w-4 h-4 ${activeRole === "pm" ? "text-[#3182ce]" : "text-slate-400"}`} />
                  产品经理 (PM)
                </div>
                <div className="text-xs text-slate-500 ml-6.5 leading-relaxed">
                  碎片灵感记录、业务流与边界自动补齐、导出标准 PRD
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveRole("architect")}
                className={`zg-card p-5 cursor-pointer text-left transition-all ${
                  activeRole === "architect"
                    ? "bg-gradient-to-br from-blue-50/80 to-white border-[#3182ce]/40 shadow-md translate-x-1"
                    : "bg-white/40 border-slate-200/60 hover:bg-slate-50/50"
                }`}
              >
                <div className={`font-bold text-sm mb-1.5 flex items-center gap-2.5 ${activeRole === "architect" ? "text-[#3182ce]" : "text-slate-800"}`}>
                  <Blocks className={`w-4 h-4 ${activeRole === "architect" ? "text-[#3182ce]" : "text-slate-400"}`} />
                  系统架构师
                </div>
                <div className="text-xs text-slate-500 ml-6.5 leading-relaxed">
                  数据库 ERD 逆向推导、微服务规划、自动生成接口契约
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveRole("dev_qa")}
                className={`zg-card p-5 cursor-pointer text-left transition-all ${
                  activeRole === "dev_qa"
                    ? "bg-gradient-to-br from-blue-50/80 to-white border-[#3182ce]/40 shadow-md translate-x-1"
                    : "bg-white/40 border-slate-200/60 hover:bg-slate-50/50"
                }`}
              >
                <div className={`font-bold text-sm mb-1.5 flex items-center gap-2.5 ${activeRole === "dev_qa" ? "text-[#3182ce]" : "text-slate-800"}`}>
                  <TerminalSquare className={`w-4 h-4 ${activeRole === "dev_qa" ? "text-[#3182ce]" : "text-slate-400"}`} />
                  研发与 QA 团队
                </div>
                <div className="text-xs text-slate-500 ml-6.5 leading-relaxed">
                  接口代码搭建、全路径单测生成、发布 Diff 审核与修复
                </div>
              </button>
            </div>

            {/* 右侧展示板 */}
            <div className="flex-1 bg-gradient-to-br from-slate-50/50 to-white rounded-xl p-8 border border-slate-200/60 shadow-lg shadow-slate-200/30 flex flex-col justify-between">
              <div>
                <h3 className="text-xl md:text-2xl font-bold mb-3 text-slate-900 leading-snug">
                  {currentData.title}
                </h3>
                <p className="text-slate-500 text-sm mb-10 leading-relaxed max-w-xl">
                  {currentData.subtitle}
                </p>

                {/* 步骤图 */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-8 relative">
                  {currentData.steps.map((step, idx) => {
                    const isHighlighted = idx === currentData.activeStep;
                    const isBeforeHighlight = idx < currentData.activeStep;
                    
                    return (
                      <div key={idx} className="space-y-3 relative">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-sm transition-all duration-300 ${
                            isHighlighted
                              ? "bg-gradient-to-br from-[#3182ce] to-[#2563eb] text-white shadow-md shadow-[#3182ce]/20 scale-110 ring-4 ring-blue-50"
                              : isBeforeHighlight
                              ? "bg-emerald-50 border border-emerald-200 text-emerald-600"
                              : "bg-white border border-slate-200 text-slate-400"
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className={`text-xs font-bold ${isHighlighted ? "text-[#3182ce]" : "text-slate-800"}`}>
                          {step.label}
                        </div>
                        <p className={`text-[11px] leading-relaxed ${isHighlighted ? "text-[#3182ce] font-medium animate-pulse" : "text-slate-400"}`}>
                          {isHighlighted ? currentData.highlightText : step.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 性能指标 */}
              <div className="pt-6 border-t border-slate-150 grid grid-cols-3 gap-6">
                {currentData.metrics.map((metric, idx) => (
                  <div key={idx} className="transition-all duration-300">
                    <div className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                      {metric.val}
                    </div>
                    <div className="text-[11px] text-slate-400 font-semibold mt-1">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}