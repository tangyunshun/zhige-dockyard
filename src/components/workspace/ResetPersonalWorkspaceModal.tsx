"use client";

import React, { useState, useEffect } from "react";
import {
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  Box,
  Terminal,
  FileText,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface ResetPersonalWorkspaceModalProps {
  isOpen: boolean;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onSuccess: (resetAt?: string) => void;
}

export function ResetPersonalWorkspaceModal({
  isOpen,
  workspaceId,
  workspaceName,
  onClose,
  onSuccess,
}: ResetPersonalWorkspaceModalProps) {
  const toast = useToast();
  const [loadingCheck, setLoadingCheck] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [checkSummary, setCheckSummary] = useState({
    assetCount: 0,
    activeTaskCount: 0,
    totalTaskCount: 0,
  });

  // 1. 自动进行重置前的前置真实数据盘点
  const loadWorkspaceStats = async () => {
    setLoadingCheck(true);
    try {
      const res = await fetch(`/api/workspace/personal-dissolve-check?workspaceId=${workspaceId}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setCheckSummary(
          data.summary || {
            assetCount: 0,
            activeTaskCount: 0,
            totalTaskCount: 0,
          }
        );
      }
    } catch (error) {
      console.error("加载空间盘点数据失败:", error);
    } finally {
      setLoadingCheck(false);
    }
  };

  useEffect(() => {
    if (isOpen && workspaceId) {
      setConfirmInput("");
      loadWorkspaceStats();
    }
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  const isConfirmed = confirmInput.trim() === "确认重置";

  // 2. 真实执行清空与数据重置
  const handleExecuteReset = async () => {
    if (!isConfirmed) {
      toast.error('请输入"确认重置"以确认授权');
      return;
    }

    setResetting(true);
    try {
      const res = await fetch("/api/workspace/clear-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          workspaceId,
          confirmText: "确认重置",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "重置个人空间数据失败");
      }

      window.dispatchEvent(new CustomEvent("zhige_workspace_components_updated"));
      toast.success(data.message || "个人空间已成功物理重置为纯净出厂状态！");
      onSuccess(data.resetAt || new Date().toISOString());
      onClose();
    } catch (err: any) {
      toast.error(err.message || "重置失败，请稍后重试");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header 顶部标题栏：符合知阁·舟坊 6.0 系统主色 */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-[#2b6cb0] via-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-between border-b border-blue-400/30 shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9.5 h-9.5 rounded-xl bg-white/15 border border-white/25 text-white flex items-center justify-center shadow-inner backdrop-blur-md shrink-0">
              <RotateCcw className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                重置个人开发空间数据
              </h3>
              <p className="text-xs text-blue-100/90 font-medium flex items-center gap-1.5 mt-0.5">
                <span>目标环境：</span>
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
          
          {/* 告警 Banner */}
          <div className="bg-gradient-to-r from-amber-50 via-orange-50/60 to-amber-50 border border-amber-200/90 rounded-2xl p-4 flex items-start gap-3.5 shadow-xs">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <h4 className="text-sm font-black text-amber-950 flex items-center gap-2">
                <span>高危资产重置提醒</span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-bold">
                  不可逆操作
                </span>
              </h4>
              <p className="text-xs text-amber-800 font-medium leading-relaxed">
                重置后将清除该个人空间下的私有草稿、历史调试日志与归档文档，并重新开辟一个干净的全新沙箱环境。
              </p>
            </div>
          </div>

          {/* 实时前置数据盘点卡片 */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs font-bold border-b border-slate-100 pb-2.5">
              <span className="text-slate-800 flex items-center gap-2 font-extrabold">
                <RefreshCw className={`w-4 h-4 text-blue-600 ${loadingCheck ? "animate-spin" : ""}`} />
                当前空间依赖数据实测盘点
              </span>
              {loadingCheck && <span className="text-blue-600 font-mono text-[11px] animate-pulse">正在盘点...</span>}
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-xl text-center">
                <span className="text-[11px] text-slate-500 font-bold block mb-1 flex items-center justify-center gap-1">
                  <Box className="w-3.5 h-3.5 text-blue-600" /> 装配组件
                </span>
                <span className="text-lg font-black font-mono text-slate-800">
                  {loadingCheck ? "-" : checkSummary.assetCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">个已绑定</span>
              </div>

              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-center">
                <span className="text-[11px] text-slate-500 font-bold block mb-1 flex items-center justify-center gap-1">
                  <Terminal className="w-3.5 h-3.5 text-indigo-600" /> 运行中任务
                </span>
                <span className="text-lg font-black font-mono text-slate-800">
                  {loadingCheck ? "-" : checkSummary.activeTaskCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">个未归档</span>
              </div>

              <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-center">
                <span className="text-[11px] text-slate-500 font-bold block mb-1 flex items-center justify-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-teal-600" /> 归档资料
                </span>
                <span className="text-lg font-black font-mono text-slate-800">
                  {loadingCheck ? "-" : checkSummary.totalTaskCount}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">条记录</span>
              </div>
            </div>
          </div>

          {/* 重置后产生的影响 */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-2 text-xs">
            <h5 className="font-extrabold text-slate-800 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              操作后将产生以下影响：
            </h5>
            <ul className="space-y-2 text-slate-600 font-medium pl-1">
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                <span>个人空间数据将被完全清空，并自动为您重新开辟一个干净的全新沙箱环境；</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                <span>自动重新装配 5 个系统出厂默认效能组件（如招标文件智能解析、原型图自动生成等）；</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                <span>当前您所加入的协作企业空间将不受任何影响，您可以照常进行团队协同。</span>
              </li>
            </ul>
          </div>

          {/* 授权输入框 */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 space-y-2.5">
            <label className="block text-xs font-black text-slate-800">
              请在此输入 <span className="text-red-600 font-mono font-black">"确认重置"</span> 以授权进行高危清空：
            </label>
            <div className="relative">
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="确认重置"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 focus:border-red-500 focus:bg-white focus:outline-hidden rounded-xl text-xs font-bold text-slate-800 transition-all placeholder:text-slate-400 placeholder:font-normal"
              />
              {isConfirmed && (
                <span className="absolute right-3 top-2.5 text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  已匹配
                </span>
              )}
            </div>
          </div>

        </div>

        {/* Footer 底部操作区 */}
        <div className="px-6 py-4 bg-white border-t border-slate-200/80 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            取消
          </button>

          <button
            disabled={!isConfirmed || resetting || loadingCheck}
            onClick={handleExecuteReset}
            className={`px-5 py-2.5 text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 ${
              isConfirmed && !resetting && !loadingCheck
                ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-t border-red-400/30"
                : "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
            }`}
          >
            {resetting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>正在重置个人空间数据...</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-4 h-4" />
                <span>确认物理重置个人空间</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
