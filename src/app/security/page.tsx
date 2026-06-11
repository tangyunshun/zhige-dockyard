"use client";

import {
  Shield,
  Lock,
  Server,
  Database,
  CheckCircle,
  ArrowRight,
} from "lucide-react";
import Footer from "@/components/Footer";

const securityFeatures = [
  {
    icon: <Server className="w-8 h-8" />,
    title: "100% 物理级隔离",
    description: "支持 Docker/K8s 离线集群部署，数据完全存储在企业内网",
    highlights: ["离线部署", "独立集群", "网络隔离"],
  },
  {
    icon: <Lock className="w-8 h-8" />,
    title: "零信任数据沙箱",
    description: "基于组件级的运行时隔离，确保数据处理过程全程可控",
    highlights: ["运行时隔离", "最小权限原则", "实时监控"],
  },
  {
    icon: <Database className="w-8 h-8" />,
    title: "本地大模型算力",
    description: "完美适配国产化算力硬件与本地知识库，数据不出企业",
    highlights: ["国产硬件适配", "本地知识库", "隐私保护"],
  },
  {
    icon: <Shield className="w-8 h-8" />,
    title: "等保与国密合规",
    description: "符合三级等保要求，全量数据采用国密算法加密",
    highlights: ["三级等保", "国密算法", "合规认证"],
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-[#f0f8ff]">
      <section className="relative bg-slate-900 py-24 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `linear-gradient(#38a169 1px, transparent 1px), linear-gradient(90deg, #38a169 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/20 rounded-full mb-8">
            <Shield className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-400 font-medium">
              企业级安全保障
            </span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-white mb-6">
            数据主权不可谈判：
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-[#3182ce]">
              军工级私有化部署架构
            </span>
          </h1>
          <p className="text-lg text-slate-300 max-w-4xl mx-auto whitespace-pre-line">
            从数据存储到模型推理，全程在您的掌控之中。让智能能力为企业赋能，而非成为数据泄露的风险点。
          </p>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-800 mb-4">
              四大核心防御网
            </h2>
            <p className="text-slate-600">全方位保障您的数据安全与业务合规</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {securityFeatures.map((feature) => (
              <div
                key={feature.title}
                className="bg-gradient-to-br from-slate-50 to-[#f0f8ff] rounded-[8px] p-8 border border-slate-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-green-500/20 to-[#2b6cb0]/20 rounded-[8px] flex items-center justify-center text-green-600 mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">
                  {feature.title}
                </h3>
                <p className="text-slate-600 mb-6">{feature.description}</p>
                <div className="flex flex-wrap gap-2">
                  {feature.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="px-3 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-4">
              私有化部署架构
            </h2>
            <p className="text-slate-400">从企业内网到本地算力，全程可控</p>
          </div>

          <div className="bg-slate-800/50 rounded-[8px] p-8 border border-slate-700">
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-700 rounded-[8px] flex items-center justify-center border-2 border-green-500/50">
                    <span className="text-green-400 font-bold text-lg">
                      内网
                    </span>
                  </div>
                  <span className="text-sm text-slate-400 mt-2">企业内网</span>
                </div>
                <div className="w-16 h-0.5 bg-gradient-to-r from-green-500 to-[#2b6cb0]" />
                <div className="w-4 h-4 bg-[#2b6cb0] rounded-full" />
              </div>

              <div className="flex items-center gap-8 mb-8">
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-[#2b6cb0] to-[#1e4d8c] rounded-[8px] flex items-center justify-center shadow-lg shadow-[#2b6cb0]/30">
                    <span className="text-white font-bold text-xl">
                      舟坊中枢
                    </span>
                  </div>
                  <span className="text-sm text-slate-300 mt-2">
                    智能调度引擎
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-8">
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-700 rounded-[8px] flex items-center justify-center border-2 border-blue-500/50">
                    <span className="text-blue-400 font-bold text-sm">
                      本地模型
                    </span>
                  </div>
                  <span className="text-sm text-slate-400 mt-2">
                    国产化算力
                  </span>
                </div>
                <div className="w-12 h-0.5 bg-gradient-to-r from-[#2b6cb0] to-transparent" />
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-700 rounded-[8px] flex items-center justify-center border-2 border-purple-500/50">
                    <span className="text-purple-400 font-bold text-sm">
                      云端能力
                    </span>
                  </div>
                  <span className="text-sm text-slate-400 mt-2">弹性扩展</span>
                </div>
              </div>

              <div className="absolute w-0.5 h-32 bg-gradient-to-b from-green-500 via-[#2b6cb0] to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-slate-800 mb-4">
              合规与认证
            </h2>
            <p className="text-slate-600">满足企业级安全合规要求</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { title: "三级等保", desc: "信息安全等级保护三级" },
              { title: "ISO 27001", desc: "信息安全管理体系" },
              { title: "国密算法", desc: "SM2/SM3/SM4" },
              { title: "SOC 2", desc: "安全运营中心认证" },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-center gap-4 bg-slate-50 rounded-[8px] p-4"
              >
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800">{item.title}</h4>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gradient-to-br from-green-600 to-[#2b6cb0]">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-black text-white mb-6">
            准备好拥抱私有化部署？
          </h2>
          <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
            让我们的安全专家为您量身定制部署方案
          </p>
          <button
            onClick={() => (window.location.href = "/auth/login")}
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-green-600 text-lg font-bold rounded-[4px] hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
          >
            <span>联系安全专家</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}