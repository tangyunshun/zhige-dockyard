"use client";

import { ShieldCheck, Server, Lock } from "lucide-react";

export default function EnterpriseSecurity() {
  return (
    <>
      {/* Section 6: Enterprise Security */}
      <section className="py-24 bg-gradient-to-br from-[#f8fafc] via-[#f0f8ff] to-[#eef6ff] text-slate-900 relative overflow-hidden">
        {/* Background decoration grid */}
        <div className="absolute inset-0 opacity-40 pointer-events-none">
          <div 
            className="absolute inset-0" 
            style={{
              backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.1) 1.5px, transparent 1.5px)",
              backgroundSize: "24px 24px"
            }}
          />
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-200/20 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center px-4 py-1.5 mb-6 text-xs font-bold text-[#3182ce] bg-blue-50 border border-blue-200/30 rounded-full shadow-sm">
              ENTERPRISE GRADE
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold mb-4 tracking-tight text-slate-950">
              为关键业务而生的
              <span className="bg-gradient-to-r from-[#3182ce] to-indigo-600 text-transparent bg-clip-text">
                私有化安全底座
              </span>
            </h2>
            <p className="text-slate-500 max-w-2xl mx-auto leading-relaxed text-sm md:text-base">
              不仅仅是智能生成能力，更是符合信创标准、金融级合规的软件工程底座。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-5 zg-card border-slate-200/60 bg-white/70">
              <div className="w-12 h-12 bg-blue-50 border border-blue-200/40 rounded-xl flex items-center justify-center text-[#3182ce] shadow-md shadow-blue-500/5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                100% 数据物理隔离
              </h3>
              <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
                支持 VPC
                专网部署，彻底隔绝外网公有云数据污染与越权抓取。所有分析计算均在企业内网节点完成。
              </p>
            </div>
            
            <div className="space-y-5 zg-card border-slate-200/60 bg-white/70">
              <div className="w-12 h-12 bg-purple-50 border border-purple-200/40 rounded-xl flex items-center justify-center text-purple-600 shadow-md shadow-purple-500/5">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">支持本地私有化部署</h3>
              <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
                可无缝集成或对接企业内部本地部署的 DeepSeek-V3/R1, Llama
                及自研算力集群，保证企业知识产权资产绝不外流。
              </p>
            </div>

            <div className="space-y-5 zg-card border-slate-200/60 bg-white/70">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-200/40 rounded-xl flex items-center justify-center text-emerald-600 shadow-md shadow-emerald-500/5">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                RBAC 细粒度权限管控
              </h3>
              <p className="text-slate-500 text-xs md:text-sm leading-relaxed">
                支持对接 LDAP，提供细化至按钮和数据的组织权限矩阵，辅以全链路操作审计日志，满足严苛的技术审计标准。
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
