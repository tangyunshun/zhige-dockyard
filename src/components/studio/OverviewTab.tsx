"use client";

import { Info, ArrowRight, CheckCircle2, Layers } from "lucide-react";
import { useState, useEffect } from "react";

interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  time: string;
}

interface OverviewTabProps {
  workspaceId: string;
  boundComponentIds: string[];
  recentTasks: TaskRecord[];
  assets: any[];
  knowledges: any[];
  allowedComponentIds: string[];
  allComponents: any[];
  setActiveTab: (tab: string) => void;
  setQuickSubStep: (step: "select" | "material") => void;
  handleComponentClick: (comp: any) => void;
  router: any;
}

export default function OverviewTab({
  workspaceId,
  boundComponentIds,
  recentTasks,
  assets,
  knowledges,
  allowedComponentIds,
  allComponents,
  setActiveTab,
  setQuickSubStep,
  handleComponentClick,
  router
}: OverviewTabProps) {
  const [apiBoundComponentIds, setApiBoundComponentIds] = useState<string[] | null>(null);
  const [apiTasks, setApiTasks] = useState<TaskRecord[] | null>(null);
  const [apiDocs, setApiDocs] = useState<any[] | null>(null);

  useEffect(() => {
    if (workspaceId) {
      // 1. 加载绑定组件
      fetch(`/api/studio?action=bound&workspaceId=${workspaceId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) setApiBoundComponentIds(data.data);
        }).catch(err => console.error("OverviewTab load bound error:", err));

      // 2. 加载最近任务
      fetch(`/api/studio?action=tasks&workspaceId=${workspaceId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) setApiTasks(data.data);
        }).catch(err => console.error("OverviewTab load tasks error:", err));

      // 3. 加载空间文档
      fetch(`/api/studio?action=documents&workspaceId=${workspaceId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) setApiDocs(data.data);
        }).catch(err => console.error("OverviewTab load documents error:", err));
    }
  }, [workspaceId]);

  const finalBoundComponentIds = apiBoundComponentIds !== null ? apiBoundComponentIds : boundComponentIds;
  const finalTasks = apiTasks !== null ? apiTasks : recentTasks;
  const finalDocs = apiDocs !== null ? apiDocs : knowledges;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 新手引导与操作建议 */}
      <div className="bg-gradient-to-r from-blue-50/60 via-purple-50/40 to-white/30 p-5 rounded-2xl border border-blue-100/60 text-left shadow-sm backdrop-blur-sm">
        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
          <Info className="w-4 h-4 text-[#3182ce] shrink-0" /> 舟坊操作台新手建议与行动指南
        </h4>
        <div className="mt-3 text-xs text-slate-500 font-semibold leading-relaxed space-y-2">
          {boundComponentIds.length === 0 ? (
            <p>💡 <span className="text-slate-700 font-bold">建议第一步</span>：当前工作空间尚未装配任何组件，请点击 <button type="button" onClick={() => router.push(`/studio?workspaceId=${workspaceId}`)} className="text-[#3182ce] hover:text-[#2b6cb0] underline font-bold cursor-pointer transition-colors">进入挑选大厅</button> 装配所需组件。</p>
          ) : recentTasks.length === 0 ? (
            <p>⚡ <span className="text-slate-700 font-bold">建议第一步</span>：空间已装配基础研发组件。您可以通过 <button type="button" onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="text-[#3182ce] hover:text-[#2b6cb0] underline font-bold cursor-pointer transition-colors">快速开始任务</button> 提交材料发起自动化任务处理。</p>
          ) : recentTasks.filter(t => t.status === "FAILED").length > 0 ? (
            <p>⚠️ <span className="text-slate-700 font-bold">继续工作</span>：检测到最近有自动化任务处理失败，请在下方“最近任务”中点击重试或查看失败原因。</p>
          ) : assets.length > 0 ? (
            <p>📂 <span className="text-slate-700 font-bold">快速创建</span>：检测到您上传了原始文档资料，点击上方“开始新任务”可以直接基于已备资料创建自动化任务处理。</p>
          ) : (
            <p>✔ 空间当前状态良好。您可以在核心标签页中自由切换以操作组件、查阅文档以及团队规范归档。</p>
          )}
        </div>
      </div>

      {/* 三个主要操作入口卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-sm text-left flex flex-col justify-between min-h-[162px] pb-5 hover:-translate-y-1 hover:shadow-md hover:border-[#3182ce]/20 transition-all duration-300">
          <div>
            <span className="text-lg">🧩</span>
            <h4 className="font-bold text-slate-800 text-xs mt-3 uppercase tracking-wider">材料智能推荐组件</h4>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed mt-1.5">输入原始文本或诉求，系统自动识别类型推荐匹配的效能组件。</p>
          </div>
          <button type="button" onClick={() => { setActiveTab("quick"); setQuickSubStep("material"); }} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] font-bold text-left flex items-center gap-1 mt-3 cursor-pointer group">
            <span>去智能识别</span> 
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-sm text-left flex flex-col justify-between min-h-[162px] pb-5 hover:-translate-y-1 hover:shadow-md hover:border-[#3182ce]/20 transition-all duration-300">
          <div>
            <span className="text-lg">⚙️</span>
            <h4 className="font-bold text-slate-800 text-xs mt-3 uppercase tracking-wider">选择组件，开始任务</h4>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed mt-1.5">从已装配的研发效能列表中任意选择核心组件，立即处理源文件。</p>
          </div>
          <button type="button" onClick={() => { setActiveTab("quick"); setQuickSubStep("select"); }} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] font-bold text-left flex items-center gap-1 mt-3 cursor-pointer group">
            <span>选择组件开始</span> 
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        <div className="bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-sm text-left flex flex-col justify-between min-h-[162px] pb-5 hover:-translate-y-1 hover:shadow-md hover:border-[#3182ce]/20 transition-all duration-300">
          <div>
            <span className="text-lg">🕒</span>
            <h4 className="font-bold text-slate-800 text-xs mt-3 uppercase tracking-wider">继续未完成任务</h4>
            <p className="text-xs text-slate-400 font-semibold leading-relaxed mt-1.5">一键承接上一次未完成或任务处理失败的草稿，无缝继续工作。</p>
          </div>
          <button type="button" onClick={() => { setActiveTab("tasks"); }} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] font-bold text-left flex items-center gap-1 mt-3 cursor-pointer group">
            <span>进入任务看板</span> 
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* 空间大数字指标摘要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "已装配组件数", count: allowedComponentIds.filter(id => finalBoundComponentIds.includes(id)).length, color: "text-[#3182ce]" },
          { label: "执行中任务数", count: finalTasks.filter(t => t.status === "RUNNING").length, color: "text-[#38a169]" },
          { label: "已生成报告数", count: finalTasks.filter(t => t.status === "SUCCESS").length, color: "text-amber-500" },
          { label: "归档团队规范数", count: finalDocs.length, color: "text-purple-500" }
        ].map((item, idx) => (
          <div key={idx} className="bg-white/70 backdrop-blur-sm p-5 rounded-2xl border border-slate-200/70 shadow-sm text-center">
            <span className="text-xs font-bold text-slate-400 block tracking-wider uppercase">{item.label}</span>
            <span className={`text-2xl font-bold font-mono block mt-2 ${item.color}`}>{item.count}</span>
          </div>
        ))}
      </div>

      {/* 最近任务记录 */}
      <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4 text-left">
        <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <CheckCircle2 className="w-4 h-4 text-[#38a169]" /> 最近任务处理记录 (最近 3 条)
          </h4>
          <button type="button" onClick={() => setActiveTab("tasks")} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] hover:underline font-bold cursor-pointer transition-colors">
            查看全部任务 ➔
          </button>
        </div>
        {finalTasks.slice(0, 3).length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold py-8 text-center">暂无任务运行记录。</p>
        ) : (
          <div className="space-y-2.5">
            {finalTasks.slice(0, 3).map(task => (
              <div key={task.id} className="p-3 bg-slate-50/60 border border-slate-200/60 rounded-xl flex justify-between items-center text-xs">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">{task.componentId}</span>
                    <span className="font-bold text-slate-700 truncate">{task.name}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${task.status === "SUCCESS" ? "text-emerald-700 bg-emerald-50/80 border-emerald-100/55" : "text-rose-700 bg-rose-50/80 border-rose-100/55"}`}>{task.status === "SUCCESS" ? "成功" : "失败"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 常用效能组件 */}
      <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-5 rounded-2xl shadow-sm space-y-4 text-left">
        <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
          <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-[#3182ce]" /> 常用效能组件 (最近使用)
          </h4>
          <button type="button" onClick={() => setActiveTab("components")} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] hover:underline font-bold cursor-pointer transition-colors">
            查看全部组件 ➔
          </button>
        </div>
        {allComponents.filter(c => allowedComponentIds.includes(c.id) && finalBoundComponentIds.includes(c.id)).slice(0, 3).length === 0 ? (
          <p className="text-xs text-slate-400 font-semibold py-8 text-center">当前空间没有装配组件，请去大厅挑选。</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {allComponents.filter(c => allowedComponentIds.includes(c.id) && finalBoundComponentIds.includes(c.id)).slice(0, 3).map(c => (
              <div onClick={() => handleComponentClick(c)} key={c.id} className="p-4 bg-slate-50/40 hover:bg-white border border-slate-200/70 rounded-xl text-left cursor-pointer transition-all hover:shadow-md hover:border-[#3182ce]/20 group">
                <span className="text-xl">{c.icon}</span>
                <h5 className="font-bold text-slate-700 text-xs mt-2 truncate">{c.title}</h5>
                <span className="text-[10px] text-[#3182ce] font-bold block mt-2 group-hover:translate-x-0.5 transition-transform">开始使用 ➔</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
