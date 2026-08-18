"use client";

import { CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING";
  time: string;
  outputData?: any;
}

interface TasksTabProps {
  recentTasks: TaskRecord[];
  tasksFilterTab: string;
  setTasksFilterTab: (tab: string) => void;
  openStructurePreview: (task: TaskRecord) => void;
  handleSaveToKnowledge: (task: TaskRecord) => void;
  allComponents: any[];
  handleComponentClick: (comp: any) => void;
  workspaceId?: string;
}

export default function TasksTab({
  recentTasks,
  tasksFilterTab,
  setTasksFilterTab,
  openStructurePreview,
  handleSaveToKnowledge,
  allComponents,
  handleComponentClick,
  workspaceId
}: TasksTabProps) {
  const [apiTasks, setApiTasks] = useState<TaskRecord[] | null>(null);

  useEffect(() => {
    if (workspaceId) {
      const loadTasks = async () => {
        try {
          const res = await fetch(`/api/studio?action=tasks&workspaceId=${workspaceId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
              setApiTasks(data.data);
            }
          }
        } catch (e) {
          console.error("TasksTab load tasks error:", e);
        }
      };
      loadTasks();
    }
  }, [workspaceId]);

  const finalTasks = apiTasks !== null ? apiTasks : recentTasks;

  const filtered = finalTasks.filter(t => {
    if (tasksFilterTab === "ALL") return true;
    return t.status === tasksFilterTab;
  });

  return (
    <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-5 text-left animate-in fade-in duration-200">
      <div className="flex justify-between items-center pb-2.5 border-b border-slate-100">
        <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1 uppercase tracking-wider">
          <CheckCircle2 className="w-4 h-4 text-[#38a169]" /> 空间任务处理列表
        </h3>
        <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold border">
          {[
            { key: "ALL", label: "全部" },
            { key: "SUCCESS", label: "已完成" },
            { key: "FAILED", label: "失败" }
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTasksFilterTab(tab.key)}
              className={`px-2.5 py-1 rounded-md cursor-pointer transition-all ${tasksFilterTab === tab.key ? "bg-white text-slate-800 shadow-sm font-bold" : "text-slate-500 hover:text-slate-700"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-slate-400 font-semibold text-center py-8">暂无该状态下的任务处理记录</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-500 border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-400 border-b border-slate-200 text-xs font-bold tracking-wider">
                <th className="py-3 px-4 font-bold">任务名称</th>
                <th className="py-3 px-3 font-bold">关联组件</th>
                <th className="py-3 px-3 font-bold">点数消耗</th>
                <th className="py-3 px-3 font-bold">运行状态</th>
                <th className="py-3 px-4 font-bold text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white/40">
              {filtered.map(task => (
                <tr key={task.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-slate-700 truncate max-w-[200px]" title={task.name}>
                    {task.name}
                  </td>
                  <td className="py-3.5 px-3 font-mono text-slate-400">{task.componentId}</td>
                  <td className="py-3.5 px-3 font-mono text-slate-500">{task.tokenUsed || 5} 点</td>
                  <td className="py-3.5 px-3">
                    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${
                      task.status === "SUCCESS" ? "text-emerald-700 bg-emerald-50/80 border-emerald-100/55" :
                      "text-rose-700 bg-rose-50/80 border-rose-100/55"
                    }`}>{task.status === "SUCCESS" ? "成功" : "失败"}</span>
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-xs space-x-2">
                    {task.status === "SUCCESS" ? (
                      <>
                        <button type="button" onClick={() => openStructurePreview(task)} className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer">看板</button>
                        <span className="text-slate-200">|</span>
                        <button
                          type="button"
                          onClick={() => handleSaveToKnowledge(task)}
                          className="text-amber-600 hover:text-amber-700 hover:underline cursor-pointer"
                        >
                          沉淀
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const comp = allComponents.find(c => c.id === task.componentId);
                          if (comp) handleComponentClick(comp);
                        }}
                        className="text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                      >
                        重试
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
