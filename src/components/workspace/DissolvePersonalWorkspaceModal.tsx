"use client";

import React, { useState, useEffect } from "react";
import {
  FolderCheck,
  FolderX,
  CheckCircle2,
  XCircle,
  Box,
  Trash2,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Layers,
  Sparkles,
  Loader2,
  Terminal,
  Activity,
  UserCheck,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface DissolvePersonalWorkspaceModalProps {
  isOpen: boolean;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onPassed: (workspaceId: string) => void;
}



export function DissolvePersonalWorkspaceModal({
  isOpen,
  workspaceId,
  workspaceName,
  onClose,
  onPassed,
}: DissolvePersonalWorkspaceModalProps) {
  const toast = useToast();
  const [scanning, setScanning] = useState(true);
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [checkData, setCheckData] = useState<any>(null);
  const [cleaning, setCleaning] = useState(false);
  const [activeTab, setActiveTab] = useState<"assets" | "tasks">("assets");

  // 1. 扫描动画与 API 查询
  const runPersonalCheck = async () => {
    setScanning(true);
    setScanStep(1);
    setScanProgress(20);

    try {
      // 步骤 1: 个人沙箱身份校验
      await new Promise((r) => setTimeout(r, 250));
      setScanStep(2);
      setScanProgress(50);

      // 步骤 2: 个人装配资产与草稿盘点
      await new Promise((r) => setTimeout(r, 250));
      setScanStep(3);
      setScanProgress(80);

      // 步骤 3: 请求后端 API
      const res = await fetch(`/api/workspace/personal-dissolve-check?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      setScanStep(4);
      setScanProgress(100);
      await new Promise((r) => setTimeout(r, 200));

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "获取检测结果失败");
      }

      const data = await res.json();
      setCheckData(data);

      if (data?.summary?.assetCount > 0) {
        setActiveTab("assets");
      } else if (data?.summary?.activeTaskCount > 0) {
        setActiveTab("tasks");
      }
    } catch (err: any) {
      toast.error(err.message || "个人沙箱检测请求异常");
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen && workspaceId) {
      runPersonalCheck();
    }
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  // 2. 数据清理 API
  const handleCleanupAction = async (
    action: "UNBIND_ASSETS" | "CANCEL_TASKS" | "CLEAR_ALL" | "UNBIND_SINGLE_ASSET" | "CANCEL_SINGLE_TASK",
    targetId?: string
  ) => {
    setCleaning(true);
    try {
      const payload: any = { workspaceId, action };
      if (action === "UNBIND_SINGLE_ASSET") payload.targetUsageId = targetId;
      if (action === "CANCEL_SINGLE_TASK") payload.targetTaskId = targetId;

      const res = await fetch(`/api/workspace/personal-dissolve-cleanup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "清理操作失败");
      }

      const result = await res.json();
      toast.success(result.message || "个人依赖数据清理完成！");

      await runPersonalCheck();
    } catch (err: any) {
      toast.error(err.message || "清理个人沙箱数据时出错");
    } finally {
      setCleaning(false);
    }
  };

  const summary = checkData?.summary || { assetCount: 0, activeTaskCount: 0, totalTaskCount: 0 };
  const details = checkData?.details || { assets: [], tasks: [] };
  const canDissolve = checkData?.canDissolve === true;
  const totalBlocked = (summary.assetCount || 0) + (summary.activeTaskCount || 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header 顶部标题栏：严格遵循知阁·舟坊知性蓝系统主色 */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-between border-b border-blue-400/30 shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9.5 h-9.5 rounded-xl bg-white/15 border border-white/25 text-white flex items-center justify-center shadow-inner backdrop-blur-md shrink-0">
              <FolderX className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                个人开发沙箱注销合规检测
              </h3>
              <p className="text-xs text-blue-100/90 font-medium flex items-center gap-1.5 mt-0.5">
                <span>沙箱环境：</span>
                <span className="bg-white/15 px-2 py-0.5 rounded-full text-white font-extrabold text-[11px] border border-white/20 select-all">
                  {workspaceName || "个人空间"}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/15 text-blue-100 hover:text-white flex items-center justify-center transition-all cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        {/* Content Body 内容区 */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/60">
          
          {/* 阶段 1: 个人沙箱扫描动画界面 (Scanning State) */}
          {scanning ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-6 text-center">
              
              {/* 个人沙箱旋转脉冲盘 */}
              <div className="relative flex items-center justify-center">
                <div className="w-20 h-20 rounded-full border-2 border-dashed border-blue-400/50 animate-spin-slow" />
                <div className="absolute w-15 h-15 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-md">
                  <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>

              {/* 实时总进度条 */}
              <div className="w-full max-w-sm space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-800 font-extrabold">
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    正在盘点个人沙箱组件资产与后台任务...
                  </span>
                  <span className="font-mono text-blue-600 font-black">{scanProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-600 h-full transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-medium pt-1">
                  正在实时盘点私有数据与安全状态，请稍候
                </p>
              </div>

              {/* 4 项逐条扫描卡片 */}
              <div className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-xl p-4 border border-blue-100 shadow-xs space-y-3 text-left">
                
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2 text-slate-800">
                    {scanStep > 1 ? (
                      <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    )}
                    个人独享沙箱所有权验证
                  </span>
                  {scanStep > 1 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 通过
                    </span>
                  ) : (
                    <span className="text-blue-600 text-[10px] font-mono animate-pulse">校验中</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2 text-slate-800">
                    {scanStep > 2 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : scanStep === 2 ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    个人装配组件与私有草稿盘点
                  </span>
                  {scanStep > 2 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : scanStep === 2 ? (
                    <span className="text-blue-600 text-[10px] font-mono animate-pulse">盘点中</span>
                  ) : (
                    <span className="text-slate-300 text-[10px] font-mono">等待</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2 text-slate-800">
                    {scanStep > 3 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : scanStep === 3 ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    后台效能执行任务状态审计
                  </span>
                  {scanStep > 3 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : scanStep === 3 ? (
                    <span className="text-blue-600 text-[10px] font-mono animate-pulse">盘点中</span>
                  ) : (
                    <span className="text-slate-300 text-[10px] font-mono">等待</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2 text-slate-800">
                    {scanStep > 4 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : scanStep === 4 ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    私有资料库与配额依赖审查
                  </span>
                  {scanStep > 4 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : scanStep === 4 ? (
                    <span className="text-blue-600 text-[10px] font-mono animate-pulse">汇总中</span>
                  ) : (
                    <span className="text-slate-300 text-[10px] font-mono">等待</span>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <>
              {/* 阶段 2: 结果面板 */}
              {canDissolve ? (
                /* 合规通过 */
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <FolderCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-sm font-black text-emerald-950 flex items-center gap-2">
                      <span>检测通过：当前个人沙箱符合注销条件！</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold">
                        纯净沙箱
                      </span>
                    </h4>
                    <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                      该个人沙箱内未绑定任何个人组件草稿，且无后台正在运行的效能任务。注销后您可以随时重新创建一个干净的研发沙箱。
                    </p>
                  </div>
                </div>
              ) : (
                /* 未通过拦截 Banner */
                <div className="bg-gradient-to-r from-amber-50 via-orange-50/50 to-amber-50 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3.5 shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-black text-amber-950 tracking-tight">
                        注销暂缓：检测到私有组件资产或运行任务未清空
                      </h4>
                      <span className="px-2.5 py-0.5 bg-amber-600 text-white rounded-full text-xs font-mono font-black shadow-xs shrink-0">
                        残留项: {totalBlocked}
                      </span>
                    </div>
                    <p className="text-xs text-amber-800 font-medium leading-relaxed">
                      为避免您的个人研发代码草稿与任务历史误删丢失，注销前请先清空绑定的个人组件资产或取消后台运行任务。
                    </p>
                  </div>
                </div>
              )}

              {/* 2 列数据指标 Overview */}
              <div className="grid grid-cols-2 gap-3.5">
                <div
                  onClick={() => setActiveTab("assets")}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activeTab === "assets"
                      ? "bg-white border-2 border-blue-600 shadow-md ring-4 ring-blue-500/10 scale-[1.01]"
                      : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <Box className="w-4 h-4 text-blue-600" />
                      个人已装配组件
                    </span>
                    {summary.assetCount > 0 ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-slate-900">{summary.assetCount}</span>
                    <span className="text-xs text-slate-400 font-bold">个已绑定</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("tasks")}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activeTab === "tasks"
                      ? "bg-white border-2 border-blue-600 shadow-md ring-4 ring-blue-500/10 scale-[1.01]"
                      : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-indigo-600" />
                      运行/后台任务
                    </span>
                    {summary.activeTaskCount > 0 ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-slate-900">{summary.activeTaskCount}</span>
                    <span className="text-xs text-slate-400 font-bold">个未归档</span>
                  </div>
                </div>
              </div>

              {/* 快捷清理工具栏 (Quick Action Bar) */}
              {!canDissolve && (
                <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 border border-blue-200/80 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-blue-950">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-700 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <span>快捷处理：使用沙箱工具一键清空私有草稿与关联任务</span>
                  </div>
                  <button
                    disabled={cleaning}
                    onClick={() => handleCleanupAction("CLEAR_ALL")}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    一键清空沙箱依赖
                  </button>
                </div>
              )}

              {/* 详情数据列表 */}
              {!canDissolve && (
                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4.5 py-2.5 text-xs font-bold">
                    <div className="flex items-center gap-5">
                      <button
                        onClick={() => setActiveTab("assets")}
                        className={`py-1 flex items-center gap-2 transition-all cursor-pointer ${
                          activeTab === "assets"
                            ? "text-blue-600 border-b-2 border-blue-600 font-black"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Layers className="w-4 h-4" />
                        个人已装配组件 ({details.assets?.length || 0})
                      </button>
                      <button
                        onClick={() => setActiveTab("tasks")}
                        className={`py-1 flex items-center gap-2 transition-all cursor-pointer ${
                          activeTab === "tasks"
                            ? "text-blue-600 border-b-2 border-blue-600 font-black"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Activity className="w-4 h-4" />
                        后台效能任务 ({details.tasks?.length || 0})
                      </button>
                    </div>

                    {activeTab === "assets" && details.assets?.length > 0 && (
                      <button
                        disabled={cleaning}
                        onClick={() => handleCleanupAction("UNBIND_ASSETS")}
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5 cursor-pointer transition-all hover:underline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        解绑所有个人组件
                      </button>
                    )}

                    {activeTab === "tasks" && details.tasks?.length > 0 && (
                      <button
                        disabled={cleaning}
                        onClick={() => handleCleanupAction("CANCEL_TASKS")}
                        className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1.5 cursor-pointer transition-all hover:underline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        清理所有效能任务
                      </button>
                    )}
                  </div>

                  {/* List Data Items */}
                  <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                    {activeTab === "assets" && (
                      details.assets?.length > 0 ? (
                        details.assets.map((asset: any) => (
                          <div
                            key={asset.id}
                            className="p-3.5 flex items-center justify-between hover:bg-blue-50/30 hover:translate-x-0.5 transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
                                <Box className="w-4.5 h-4.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate">{asset.name}</p>
                                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                                  分类：<span className="text-slate-600 font-bold">{asset.category || "通用组件"}</span>
                                </p>
                              </div>
                            </div>
                            <button
                              disabled={cleaning}
                              onClick={() => handleCleanupAction("UNBIND_SINGLE_ASSET", asset.id)}
                              className="px-3 py-1 text-xs bg-white border border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 rounded-lg transition-all cursor-pointer font-black shadow-2xs hover:shadow-xs shrink-0"
                            >
                              解绑
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>个人沙箱未绑定任何组件草稿</span>
                        </div>
                      )
                    )}

                    {activeTab === "tasks" && (
                      details.tasks?.length > 0 ? (
                        details.tasks.map((task: any) => (
                          <div
                            key={task.id}
                            className="p-3.5 flex items-center justify-between hover:bg-blue-50/30 hover:translate-x-0.5 transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
                                <Terminal className="w-4.5 h-4.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate">{task.title}</p>
                                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                                  状态：<span className="text-slate-600 font-bold">{task.status}</span>
                                </p>
                              </div>
                            </div>
                            <button
                              disabled={cleaning}
                              onClick={() => handleCleanupAction("CANCEL_SINGLE_TASK", task.id)}
                              className="px-3 py-1 text-xs bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-lg transition-all cursor-pointer font-black shadow-2xs hover:shadow-xs shrink-0"
                            >
                              清理
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>个人沙箱无未归档的效能任务</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer 底部操作区 */}
        <div className="px-6 py-4 bg-white border-t border-slate-200/80 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            取消
          </button>

          <div className="flex items-center gap-3">
            <button
              disabled={scanning || cleaning}
              onClick={runPersonalCheck}
              className="px-4 py-2 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-extrabold rounded-xl cursor-pointer transition-all flex items-center gap-2 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${scanning ? "animate-spin" : ""}`} />
              重新检测
            </button>

            {scanning ? (
              <button
                disabled
                className="px-5 py-2.5 bg-slate-100 text-slate-400 text-xs font-bold rounded-xl cursor-not-allowed border border-slate-200 flex items-center gap-2"
              >
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>正在合规检测中...</span>
              </button>
            ) : canDissolve ? (
              <button
                onClick={() => onPassed(workspaceId)}
                className="px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2 active:scale-95 border-t border-red-400/30"
              >
                <span>下一步：确认注销个人空间</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                disabled
                className="px-5 py-2.5 bg-slate-200 text-slate-400 text-xs font-bold rounded-xl cursor-not-allowed transition-all"
              >
                请先解绑私有组件资产
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
