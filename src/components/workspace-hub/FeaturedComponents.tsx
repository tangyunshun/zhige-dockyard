"use client";

import React from "react";
import { LayoutTemplate, Workflow, ShieldCheck, Database, FileCode } from "lucide-react";
import { useRouter } from "next/navigation";

export default function FeaturedComponents() {
  const router = useRouter();

  const components = [
    {
      id: "C01",
      title: "标书契约解析与售后派单",
      tag: "高效流转",
      tagColor: "bg-purple-50 text-purple-600 border-purple-100",
      description: "规范解构复杂合同条款与边界条件，自动转化售后派单流程，实现无缝协同。",
      icon: <Workflow className="w-4 h-4 text-purple-600" />,
      iconBg: "bg-purple-50 border-purple-100 group-hover:bg-purple-100",
      borderHover: "hover:border-purple-300",
      glowBorder: "group-hover:border-purple-400/20"
    },
    {
      id: "C03",
      title: "合规与风控审计",
      tag: "核心风控",
      tagColor: "bg-blue-50 text-[#2b6cb0] border-blue-100",
      description: "对全链路事件进行分布式合规拦截，保障资产与三方数据高度隔离。",
      icon: <ShieldCheck className="w-4 h-4 text-[#2b6cb0]" />,
      iconBg: "bg-blue-50 border-blue-100 group-hover:bg-blue-100",
      borderHover: "hover:border-[#2b6cb0]/30",
      glowBorder: "group-hover:border-blue-400/20"
    },
    {
      id: "C10",
      title: "高拟真仿真数据生成",
      tag: "仿真数据",
      tagColor: "bg-emerald-50 text-emerald-600 border-emerald-100",
      description: "一键批量合成海量沙箱业务数据，供系统性能与业务回溯。",
      icon: <Database className="w-4 h-4 text-emerald-600" />,
      iconBg: "bg-emerald-50 border-emerald-100 group-hover:bg-emerald-100",
      borderHover: "hover:border-emerald-300",
      glowBorder: "group-hover:border-emerald-400/20"
    },
    {
      id: "C02",
      title: "需求定义与产品设计",
      tag: "设计协同",
      tagColor: "bg-orange-50 text-orange-600 border-orange-100",
      description: "将研发需求一键图表结构化，辅助设计评审并快捷导出为 PRD。",
      icon: <FileCode className="w-4 h-4 text-orange-600" />,
      iconBg: "bg-orange-50 border-orange-100 group-hover:bg-orange-100",
      borderHover: "hover:border-orange-300",
      glowBorder: "group-hover:border-orange-400/20"
    }
  ];

  return (
    <div className="relative z-10 bg-white/70 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:border-[#2b6cb0]/20 transition-all duration-300">
      
      {/* 头部 */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center">
            <LayoutTemplate className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">舟坊精选组件大厅</h3>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">🏆 舟坊推荐引擎根据您当前的技术栈偏好与组件热度，为您精选以下 4 个最匹配的协同研发资产</p>
          </div>
        </div>
        <span className="text-[10px] text-[#2b6cb0] font-bold bg-[#2b6cb0]/5 border border-[#2b6cb0]/10 px-2 py-0.5 rounded">
          2.0 推荐引擎已就绪
        </span>
      </div>

      {/* 网格列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {components.map((comp) => (
          <div 
            key={comp.id}
            onClick={() => router.push(`/components/explore?id=${comp.id}`)}
            className={`p-4 bg-white/60 border border-slate-200/80 rounded-xl hover:shadow-md hover:scale-[1.01] transition-all duration-300 cursor-pointer flex items-start gap-3 group relative overflow-hidden ${comp.borderHover}`}
          >
            {/* 图标 */}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border transition-colors ${comp.iconBg}`}>
              {comp.icon}
            </div>

            {/* 文字说明 */}
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-800 group-hover:text-[#2b6cb0] transition-colors flex items-center gap-1.5 flex-wrap">
                <span>{comp.title}</span>
                <span className={`px-1 py-0.5 text-[10px] font-bold rounded border ${comp.tagColor}`}>
                  {comp.tag}
                </span>
              </h4>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                {comp.description}
              </p>
            </div>
            {/* Hover 发光边框 */}
            <div className={`absolute inset-0 border border-transparent rounded-xl transition-all duration-300 pointer-events-none ${comp.glowBorder}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
