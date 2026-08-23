"use client";

import React from "react";
import { useAppContext } from "@/contexts/AppContext";
import { ClipboardList, HelpCircle, Terminal, Info, Copy } from "lucide-react";
import { useToast } from "@/components/Toast";

interface ComponentDetailProps {
  componentId: string;
}

interface DetailData {
  id: string;
  name: string;
  description: string;
  fullDescription: string;
  usage: string;
  apiDoc: string;
  faq: Array<{ q: string; a: string }>;
}

export default function ComponentDetail({ componentId }: ComponentDetailProps) {
  const toast = useToast();
  // 组件信息来自数据库（component_catalog 表），深度详情读取 detail 字段
  const { componentCatalog } = useAppContext();
  const comp = componentCatalog.find((c) => c.id === componentId);
  if (!comp) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center text-slate-400">
        未找到该组件信息
      </div>
    );
  }

  const dbDetail = (comp as any).detail as Partial<DetailData> | null | undefined;

  // 详情优先读取数据库 detail 字段；未配置时派生默认内容，确保每个组件都有展示
  const details: DetailData = {
    id: comp.id,
    name: comp.name,
    description: comp.description,
    fullDescription: dbDetail?.fullDescription || `${comp.name} 是专门针对「${comp.description}」阶段设计的高效解决方案。本组件在平台底座与本地隔离沙箱下运行，可自动结合当前工作空间的数据流水和权限模型，实现高内聚的数据处理与审计可追溯，确保企业研发全流程的信息安全与质量防护。`,
    usage: dbDetail?.usage || `1. 确保本组件已经在当前工作空间中引进绑定（若显示受限，请联系管理员或升级空间）。\n2. 在主调试面板的输入框中输入业务指令或上传测试数据报文。\n3. 点击'模拟调试运行'，扣减对应的额度（标称估算 ${comp.estimatedTokens} 点）。\n4. 查阅控制台实时输出的返回结果，检查数据与预期是否一致。`,
    apiDoc: dbDetail?.apiDoc || `请求方法: POST\n请求端点: /api/studio (action=use / action=simulate)\n\n输入参数 (JSON)：\n- action: 'use' | 'simulate' (必填，运行操作)\n- componentId: '${comp.id}' (必填，组件标识)\n- workspaceId: String (必填，目标空间 ID)\n- tokens: Number (模拟扣减的算力点数)\n\n返回结果：\n- success: Boolean (执行状态)\n- tokenBalance: Number (空间当前剩余的算力点数)`,
    faq: dbDetail?.faq || [
      { q: "这个组件会产生费用吗？", a: comp.isPremium ? "是的，本组件属于高级付费组件（Premium）。免费级别的个人空间无法直接运行，需要您升级为企业协作版或者黄金会员解锁全量使用。" : "不需要，本组件属于基础开放组件。所有级别的个人和企业工作空间均可以直接加载并运行。" },
      { q: "运行本组件需要扣减多少算力？", a: `本组件单次模拟运行的基准算力消耗约为 ${comp.estimatedTokens} 点。在您执行运行时，系统将直接从工作空间持有的调用额度中自动扣除。` },
      { q: "数据传输是否安全？数据是否会被收集？", a: "请完全放心。平台支持完全隔离的本地沙箱环境，所有的输入数据在完成处理后会立即销毁，审计日志只保留使用操作轨迹，绝不会用于其他目的。" }
    ]
  };

  return (
    <div className="space-y-6 text-left">
      {/* 1. 详细介绍 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-3 uppercase tracking-wider">
          <Info className="w-4 h-4 text-[#3182ce]" />
          组件深度解读
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          {details.fullDescription}
        </p>
      </section>

      {/* 2. 使用步骤 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-3 uppercase tracking-wider">
          <ClipboardList className="w-4 h-4 text-emerald-500" />
          使用操作指南
        </h4>
        <div className="space-y-1.5">
          {details.usage.split("\n").map((line, idx) => (
            <p key={idx} className="text-xs text-slate-600 leading-relaxed font-medium">
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* 3. API开发文档 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-slate-700" />
            API 接入文档
          </h4>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(details.apiDoc);
              toast.success("API 示例已复制到剪贴板！");
            }}
            className="text-xs text-[#3182ce] bg-blue-50/50 hover:bg-blue-50 border border-blue-100/60 hover:border-blue-200 px-2.5 py-0.5 rounded flex items-center gap-1 font-bold cursor-pointer transition-colors"
            title="一键复制 API 接口接入规范"
          >
            <Copy className="w-2.5 h-2.5" />
            <span>复制示例</span>
          </button>
        </div>
        <pre className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-xs text-slate-700 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap text-left">
          {details.apiDoc}
        </pre>
      </section>

      {/* 4. 常见问题 (FAQ) */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-3 uppercase tracking-wider">
          <HelpCircle className="w-4 h-4 text-amber-500" />
          常见问题问答
        </h4>
        <div className="space-y-4">
          {details.faq.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-xs font-bold text-slate-800 flex items-start gap-1">
                <span className="text-amber-500 font-extrabold">Q:</span>
                <span>{item.q}</span>
              </div>
              <div className="text-xs text-slate-500 font-semibold leading-relaxed pl-4">
                {item.a}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
