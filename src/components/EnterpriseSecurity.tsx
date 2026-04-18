"use client";

import { ShieldCheck, Cpu, Lock } from "lucide-react";

export default function EnterpriseSecurity() {
  return (
    <>
      {/* Section 6: Enterprise Security */}
      <section className="py-24 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] text-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 text-xs font-semibold text-blue-300 bg-blue-500/10 border border-blue-400/20 rounded-full backdrop-blur-sm">
              ENTERPRISE GRADE
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight">
              为关键业务而生的
              <span className="bg-gradient-to-r from-blue-400 to-indigo-400 text-transparent bg-clip-text">
                私有化安全底座
              </span>
            </h2>
            <p className="text-slate-300 max-w-2xl mx-auto leading-relaxed">
              不仅仅是 AI，更是符合信创标准、金融级合规的软件工程底座。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-6 zg-card bg-white/5 border-white/10 backdrop-blur-sm">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-blue-600/10 rounded-xl flex items-center justify-center text-blue-400 border border-blue-400/30 shadow-lg shadow-blue-500/10">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                100% 数据物理隔离
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                支持 VPC
                专网部署，彻底隔绝外网公有云污染。所有分析计算均在企业内网节点完成。
              </p>
            </div>
            <div className="space-y-6 zg-card bg-white/5 border-white/10 backdrop-blur-sm">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-purple-600/10 rounded-xl flex items-center justify-center text-purple-400 border border-purple-400/30 shadow-lg shadow-purple-500/10">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">私有大模型微调</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                支持无缝对接本地部署的 DeepSeek, Llama
                或企业自研算力集群，确保知识资产不外流。
              </p>
            </div>
            <div className="space-y-6 zg-card bg-white/5 border-white/10 backdrop-blur-sm">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 rounded-xl flex items-center justify-center text-emerald-400 border border-emerald-400/30 shadow-lg shadow-emerald-500/10">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">
                RBAC 细粒度权限管控
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                精确到按钮级的组织架构与权限矩阵，支持审计日志全程溯源，满足严苛的合规审计要求。
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
