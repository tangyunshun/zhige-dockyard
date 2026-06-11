"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle, TrendingDown, TrendingUp, Clock, Users, Shield, Code, Database } from "lucide-react";
import Footer from "@/components/Footer";

type TabType = "integrator" | "government" | "outsourcing";

interface TabContent {
  title: string;
  subtitle: string;
  highlights: string[];
  metrics: { label: string; value: string; change: string; icon: React.ReactNode }[];
  benefits: { title: string; description: string; icon: React.ReactNode }[];
}

const tabContents: Record<TabType, TabContent> = {
  integrator: {
    title: "软件集成商",
    subtitle: "售前打单成本降低 40%，交付周期缩短",
    highlights: [
      "标书智能解析，快速响应招标需求",
      "自动化方案文档生成，提升专业形象",
      "需求分析与技术方案一键生成",
      "交付质量标准化，降低实施风险",
    ],
    metrics: [
      { label: "售前成本降低", value: "40%", change: "-40%", icon: <TrendingDown className="w-4 h-4" /> },
      { label: "交付周期缩短", value: "30%", change: "-30%", icon: <Clock className="w-4 h-4" /> },
      { label: "中标率提升", value: "25%", change: "+25%", icon: <TrendingUp className="w-4 h-4" /> },
      { label: "客户满意度", value: "98%", change: "+18%", icon: <Users className="w-4 h-4" /> },
    ],
    benefits: [
      { title: "标书智能解析", description: "自动识别招标需求要点，快速生成响应方案", icon: <Code className="w-6 h-6" /> },
      { title: "方案文档自动生成", description: "基于需求自动生成专业技术方案文档", icon: <Database className="w-6 h-6" /> },
      { title: "成本估算辅助", description: "智能估算项目成本，精准报价", icon: <TrendingUp className="w-6 h-6" /> },
    ],
  },
  government: {
    title: "政企 IT 部门",
    subtitle: "全链路代码审计、信创环境兼容、知识库私有化",
    highlights: [
      "代码安全审计，保障系统稳定性",
      "信创环境适配，满足合规要求",
      "知识资产沉淀，构建组织级知识库",
      "私有化部署，数据安全可控",
    ],
    metrics: [
      { label: "安全漏洞发现", value: "95%", change: "+60%", icon: <Shield className="w-4 h-4" /> },
      { label: "信创适配效率", value: "80%", change: "+50%", icon: <Code className="w-4 h-4" /> },
      { label: "知识复用率", value: "75%", change: "+45%", icon: <Database className="w-4 h-4" /> },
      { label: "合规达标率", value: "100%", change: "+20%", icon: <CheckCircle className="w-4 h-4" /> },
    ],
    benefits: [
      { title: "全链路代码审计", description: "深度代码分析，识别安全隐患与性能问题", icon: <Shield className="w-6 h-6" /> },
      { title: "信创环境兼容", description: "自动适配国产操作系统与数据库", icon: <Code className="w-6 h-6" /> },
      { title: "知识库私有化", description: "构建企业级知识资产，沉淀业务经验", icon: <Database className="w-6 h-6" /> },
    ],
  },
  outsourcing: {
    title: "实施外包团队",
    subtitle: "标准化代码生成、人员快速流转接手",
    highlights: [
      "标准化代码模板，保证交付质量",
      "新人快速上手，降低学习成本",
      "文档自动生成，提升可维护性",
      "代码审查辅助，统一编码规范",
    ],
    metrics: [
      { label: "新人上手周期", value: "7天", change: "-60%", icon: <Clock className="w-4 h-4" /> },
      { label: "代码复用率", value: "60%", change: "+35%", icon: <Code className="w-4 h-4" /> },
      { label: "缺陷率降低", value: "50%", change: "-50%", icon: <TrendingDown className="w-4 h-4" /> },
      { label: "团队效率提升", value: "40%", change: "+40%", icon: <TrendingUp className="w-4 h-4" /> },
    ],
    benefits: [
      { title: "标准化代码生成", description: "生成符合规范的高质量代码", icon: <Code className="w-6 h-6" /> },
      { title: "快速知识传递", description: "自动生成文档，新人快速接手", icon: <Users className="w-6 h-6" /> },
      { title: "智能代码审查", description: "自动化代码质量检查，保证交付标准", icon: <Shield className="w-6 h-6" /> },
    ],
  },
};

const industryScenarios = [
  {
    title: "智慧水利",
    description: "水电站大坝智能化运维、水资源调度优化",
    stats: [
      { label: "设备故障预警准确率", value: "99.2%" },
      { label: "运维成本降低", value: "35%" },
    ],
  },
  {
    title: "重型装备制造",
    description: "起重机、盾构机等重型设备数字化设计与运维",
    stats: [
      { label: "设计周期缩短", value: "40%" },
      { label: "质量缺陷率降低", value: "55%" },
    ],
  },
  {
    title: "智慧城市",
    description: "城市大脑、智慧交通、政务服务一体化",
    stats: [
      { label: "数据处理效率", value: "80%" },
      { label: "服务响应时间", value: "<3秒" },
    ],
  },
  {
    title: "金融科技",
    description: "核心交易系统、风控平台、智能客服",
    stats: [
      { label: "交易处理能力", value: "10万TPS" },
      { label: "风险识别准确率", value: "99.8%" },
    ],
  },
];

export default function SolutionsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("integrator");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f8ff] to-white">
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 mb-6">
            行业解决方案
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            针对不同行业特点，提供定制化的效能提升方案
          </p>
        </div>
      </section>

      <section className="py-16 bg-[#f0f8ff]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-4 mb-12">
            {(Object.keys(tabContents) as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-full font-medium transition-all ${
                  activeTab === tab
                    ? "bg-[#2b6cb0] text-white shadow-lg shadow-[#2b6cb0]/30"
                    : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
              >
                {tabContents[tab].title}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-black text-slate-800 mb-4">
                {tabContents[activeTab].title}
              </h2>
              <p className="text-xl text-slate-600 mb-8">
                {tabContents[activeTab].subtitle}
              </p>
              <ul className="space-y-4">
                {tabContents[activeTab].highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#2b6cb0]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="w-4 h-4 text-[#2b6cb0]" />
                    </div>
                    <span className="text-slate-700">{highlight}</span>
                  </li>
                ))}
              </ul>
              <button className="mt-8 flex items-center gap-2 text-[#2b6cb0] font-bold hover:gap-3 transition-all">
                查看详细方案 <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {tabContents[activeTab].metrics.map((metric, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl p-6 shadow-sm hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      metric.change.startsWith("+") ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                    }`}>
                      {metric.icon}
                    </div>
                    <span className={`text-sm font-bold ${
                      metric.change.startsWith("+") ? "text-green-600" : "text-red-600"
                    }`}>
                      {metric.change}
                    </span>
                  </div>
                  <div className="text-3xl font-black text-slate-800 mb-1">{metric.value}</div>
                  <div className="text-sm text-slate-500">{metric.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-6">
            {tabContents[activeTab].benefits.map((benefit, index) => (
              <div key={index} className="bg-white rounded-xl p-6 border border-slate-100 hover:border-[#2b6cb0]/30 transition-colors">
                <div className="w-12 h-12 bg-[#2b6cb0]/10 rounded-lg flex items-center justify-center mb-4 text-[#2b6cb0]">
                  {benefit.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{benefit.title}</h3>
                <p className="text-sm text-slate-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-4">
              行业场景应用
            </h2>
            <p className="text-slate-400">深耕行业实践，打造标杆案例</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {industryScenarios.map((scenario, index) => (
              <div
                key={index}
                className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <h3 className="text-xl font-bold text-white mb-2">{scenario.title}</h3>
                <p className="text-slate-400 text-sm mb-4">{scenario.description}</p>
                <div className="space-y-2">
                  {scenario.stats.map((stat, statIndex) => (
                    <div key={statIndex} className="flex justify-between items-center">
                      <span className="text-slate-400 text-sm">{stat.label}</span>
                      <span className="text-white font-bold">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-black text-slate-800 mb-6">
            开启您的效能升级之旅
          </h2>
          <p className="text-lg text-slate-600 mb-10">
            选择适合您行业的解决方案，立即体验效能提升
          </p>
          <button className="inline-flex items-center gap-3 px-8 py-4 bg-[#2b6cb0] text-white text-lg font-bold rounded-[4px] hover:shadow-xl hover:-translate-y-1 transition-all">
            免费咨询解决方案 <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}