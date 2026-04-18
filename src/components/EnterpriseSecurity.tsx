"use client";

import { ShieldCheck, Cpu, Lock } from "lucide-react";

export default function EnterpriseSecurity() {
  return (
    <>
      {/* Section 6: Enterprise Security */}
      <section className="py-24 bg-[#0f172a] text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-xs font-medium mb-4">
              ENTERPRISE GRADE
            </div>
            <h2 className="text-3xl font-bold mb-4 tracking-tight">
              为关键业务而生的
              <span className="text-blue-400">私有化安全底座</span>
            </h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              不仅仅是 AI，更是符合信创标准、金融级合规的软件工程底座。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="space-y-6">
              <div className="w-12 h-12 bg-blue-500/20 rounded-8 flex items-center justify-center text-blue-400 border border-blue-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">100% 数据物理隔离</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                支持 VPC
                专网部署，彻底隔绝外网公有云污染。所有分析计算均在企业内网节点完成。
              </p>
            </div>
            <div className="space-y-6">
              <div className="w-12 h-12 bg-purple-500/20 rounded-8 flex items-center justify-center text-purple-400 border border-purple-500/30">
                <Cpu className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">私有大模型微调</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                支持无缝对接本地部署的 DeepSeek, Llama
                或企业自研算力集群，确保知识资产不外流。
              </p>
            </div>
            <div className="space-y-6">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-8 flex items-center justify-center text-emerald-400 border border-emerald-500/30">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold">RBAC 细粒度权限管控</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                精确到按钮级的组织架构与权限矩阵，支持审计日志全程溯源，满足严苛的合规审计要求。
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
