"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Users,
  Box,
  Trash2,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  Mail,
  UserX,
  Layers,
  Sparkles,
  Loader2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

interface DissolveWorkspaceCheckModalProps {
  isOpen: boolean;
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
  onPassed: (workspaceId: string) => void;
}



export function DissolveWorkspaceCheckModal({
  isOpen,
  workspaceId,
  workspaceName,
  onClose,
  onPassed,
}: DissolveWorkspaceCheckModalProps) {
  const toast = useToast();
  const [scanning, setScanning] = useState(true);
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [checkData, setCheckData] = useState<any>(null);
  const [cleaning, setCleaning] = useState(false);
  const [activeTab, setActiveTab] = useState<"members" | "assets">("members");

  // 1. 扫描动画与真实 API 查询逻辑
  const runDissolveCheck = async () => {
    setScanning(true);
    setScanStep(1);
    setScanProgress(15);

    try {
      // 步骤 1: 权限与身份合规校验
      await new Promise((r) => setTimeout(r, 250));
      setScanStep(2);
      setScanProgress(45);

      // 步骤 2: 团队成员盘点
      await new Promise((r) => setTimeout(r, 250));
      setScanStep(3);
      setScanProgress(75);

      // 步骤 3: 授权资产盘点与 API 调用
      const res = await fetch(`/api/workspace/dissolve-check?workspaceId=${workspaceId}`, {
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

      // 默认切换到包含数量的标签页
      if (data?.summary?.memberCount > 0) {
        setActiveTab("members");
      } else if (data?.summary?.assetCount > 0) {
        setActiveTab("assets");
      }
    } catch (err: any) {
      toast.error(err.message || "合规检测请求异常");
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen && workspaceId) {
      runDissolveCheck();
    }
  }, [isOpen, workspaceId]);

  if (!isOpen) return null;

  // 2. 执行数据清理 API
  const handleCleanupAction = async (
    action: "REMOVE_MEMBERS" | "UNBIND_ASSETS" | "CLEAR_ALL" | "REMOVE_SINGLE_MEMBER" | "UNBIND_SINGLE_ASSET",
    targetId?: string
  ) => {
    setCleaning(true);
    try {
      const payload: any = { workspaceId, action };
      if (action === "REMOVE_SINGLE_MEMBER") payload.targetMemberId = targetId;
      if (action === "UNBIND_SINGLE_ASSET") payload.targetUsageId = targetId;

      const res = await fetch(`/api/workspace/dissolve-cleanup`, {
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
      toast.success(result.message || "依赖数据清理成功！");

      // 重新发起合规盘点扫描
      await runDissolveCheck();
    } catch (err: any) {
      toast.error(err.message || "执行数据清理时出错");
    } finally {
      setCleaning(false);
    }
  };

  const summary = checkData?.summary || { memberCount: 0, assetCount: 0, pendingInvitationCount: 0 };
  const details = checkData?.details || { members: [], assets: [], pendingInvitations: [] };
  const canDissolve = checkData?.canDissolve === true;
  const totalBlocked = (summary.memberCount || 0) + (summary.assetCount || 0);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        
        {/* Header 顶部标题栏：升级为品牌专属知性蓝高光渐变 Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white flex items-center justify-between border-b border-blue-500/30 shrink-0 shadow-md">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/25 text-white flex items-center justify-center shadow-inner backdrop-blur-md shrink-0">
              <ShieldAlert className="w-5.5 h-5.5 animate-pulse text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                解散企业空间前置合规检测
              </h3>
              <p className="text-xs text-blue-100/90 font-medium flex items-center gap-1.5 mt-0.5">
                <span>目标工作空间：</span>
                <span className="bg-white/15 px-2 py-0.5 rounded-full text-white font-extrabold text-[11px] border border-white/20 select-all">
                  {workspaceName}
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
          
          {/* 阶段 1: 扫描动画界面 (Scanning State) 品牌升级版 */}
          {scanning ? (
            <div className="py-10 flex flex-col items-center justify-center space-y-6 text-center">
              
              {/* 阻尼旋转与科技脉冲动画盘 */}
              <div className="relative flex items-center justify-center">
                {/* 外圈慢速旋转环 */}
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-blue-400/50 animate-spin-slow" />
                
                {/* 核心卡盘 */}
                <div className="absolute w-18 h-18 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 text-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <RefreshCw className="w-9 h-9 animate-spin text-blue-600" />
                </div>
                
                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              </div>

              {/* 实时总进度条面板 */}
              <div className="w-full max-w-md space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5 text-slate-800 font-extrabold">
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    正在深入盘点空间关联资产与成员数据...
                  </span>
                  <span className="font-mono text-blue-600 font-black">{scanProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 h-full transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-medium pt-1">
                  为防误删与符合大厂合规风控，系统正在实时交握比对数据库依赖链
                </p>
              </div>

              {/* 4 项逐条扫描卡片列表 */}
              <div className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-xl p-4.5 border border-blue-100/80 shadow-sm space-y-3.5 text-left">
                
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2.5 text-slate-800 font-bold">
                    {scanStep > 1 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    )}
                    所有者管理权限与账号状态审计
                  </span>
                  {scanStep > 1 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200/80 rounded-full text-[10px] font-mono font-bold animate-pulse">
                      处理中
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2.5 text-slate-800 font-bold">
                    {scanStep > 2 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : scanStep === 2 ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    企业协作团队成员绑定关系检查
                  </span>
                  {scanStep > 2 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : scanStep === 2 ? (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200/80 rounded-full text-[10px] font-mono font-bold animate-pulse">
                      盘点中
                    </span>
                  ) : (
                    <span className="text-slate-300 text-[11px] font-mono">等待</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2.5 text-slate-800 font-bold">
                    {scanStep > 3 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : scanStep === 3 ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    已装配与授权组件资产 (Component Usage) 盘点
                  </span>
                  {scanStep > 3 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : scanStep === 3 ? (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200/80 rounded-full text-[10px] font-mono font-bold animate-pulse">
                      盘点中
                    </span>
                  ) : (
                    <span className="text-slate-300 text-[11px] font-mono">等待</span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-2.5 text-slate-800 font-bold">
                    {scanStep > 4 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : scanStep === 4 ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                    )}
                    待结项空间邀请与外部依赖离线评估
                  </span>
                  {scanStep > 4 ? (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-[10px] font-mono font-bold">
                      ✔ 已完成
                    </span>
                  ) : scanStep === 4 ? (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200/80 rounded-full text-[10px] font-mono font-bold animate-pulse">
                      汇总中
                    </span>
                  ) : (
                    <span className="text-slate-300 text-[11px] font-mono">等待</span>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <>
              {/* 阶段 2: 扫描完成与结果状态卡片 */}
              {canDissolve ? (
                /* 合规通过状态 */
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50/50 to-emerald-50 border border-emerald-200 rounded-2xl p-4.5 flex items-start gap-4 shadow-xs">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div className="space-y-1 min-w-0">
                    <h4 className="text-sm font-black text-emerald-950 flex items-center gap-2">
                      <span>合规检测已通过：当前企业空间具备解散条件！</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-bold">
                        纯净状态
                      </span>
                    </h4>
                    <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                      经检测，该企业空间内已无任何协作团队成员及已授权组件资产，符合纯净工作空间注销规范。您可以安心申请解散。
                    </p>
                  </div>
                </div>
              ) : (
                /* 合规未通过拦截状态 — 大厂高质感 Warning Panel */
                <div className="bg-gradient-to-r from-red-50/90 via-rose-50/60 to-red-50/90 border border-red-200/90 rounded-2xl p-4.5 flex items-start gap-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-black text-red-950 tracking-tight">
                        无法直接申请解散：检测到依赖资产或协作成员未清空
                      </h4>
                      <span className="px-2.5 py-0.5 bg-red-600 text-white rounded-full text-xs font-mono font-black shadow-xs shrink-0">
                        阻断项: {totalBlocked}
                      </span>
                    </div>
                    <p className="text-xs text-red-700 font-medium leading-relaxed">
                      根据《企业空间安全合规管理规范》，解散前必须将空间内的协作团队成员移出并解绑授权组件资产。
                    </p>
                  </div>
                </div>
              )}

              {/* 3 列 Overview 核心数据指标面板 */}
              <div className="grid grid-cols-3 gap-3.5">
                <div
                  onClick={() => setActiveTab("members")}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activeTab === "members"
                      ? "bg-white border-2 border-blue-600 shadow-md ring-4 ring-blue-500/10 scale-[1.01]"
                      : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-600" />
                      协作团队成员
                    </span>
                    {summary.memberCount > 0 ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-slate-900">{summary.memberCount}</span>
                    <span className="text-xs text-slate-400 font-bold">人 (除Owner)</span>
                  </div>
                </div>

                <div
                  onClick={() => setActiveTab("assets")}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    activeTab === "assets"
                      ? "bg-white border-2 border-blue-600 shadow-md ring-4 ring-blue-500/10 scale-[1.01]"
                      : "bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <Box className="w-4 h-4 text-amber-600" />
                      授权组件资产
                    </span>
                    {summary.assetCount > 0 ? (
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-slate-900">{summary.assetCount}</span>
                    <span className="text-xs text-slate-400 font-bold">项已装配</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-slate-500" />
                      待处理邀请
                    </span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-2.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-black font-mono text-slate-900">
                      {summary.pendingInvitationCount}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">份已作废</span>
                  </div>
                </div>
              </div>

              {/* 快捷清理工具栏 (Quick Action Bar) — 黄金琥珀亮彩警示组件 */}
              {!canDissolve && (
                <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300/80 rounded-2xl p-4 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-amber-950">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <span>快捷处理：您可以使用真实清理工具一键清空以上依赖数据</span>
                  </div>
                  <button
                    disabled={cleaning}
                    onClick={() => handleCleanupAction("CLEAR_ALL")}
                    className="px-4 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shrink-0"
                  >
                    {cleaning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    一键清空全部依赖
                  </button>
                </div>
              )}

              {/* 详情数据列表卡片 */}
              {!canDissolve && (
                <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                  {/* Tabs 控制头 */}
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4.5 py-2.5 text-xs font-bold">
                    <div className="flex items-center gap-5">
                      <button
                        onClick={() => setActiveTab("members")}
                        className={`py-1 flex items-center gap-2 transition-all cursor-pointer ${
                          activeTab === "members"
                            ? "text-blue-600 border-b-2 border-blue-600 font-black"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Users className="w-4 h-4" />
                        协作团队成员 ({details.members?.length || 0})
                      </button>
                      <button
                        onClick={() => setActiveTab("assets")}
                        className={`py-1 flex items-center gap-2 transition-all cursor-pointer ${
                          activeTab === "assets"
                            ? "text-blue-600 border-b-2 border-blue-600 font-black"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        <Layers className="w-4 h-4" />
                        授权组件资产 ({details.assets?.length || 0})
                      </button>
                    </div>

                    {activeTab === "members" && details.members?.length > 0 && (
                      <button
                        disabled={cleaning}
                        onClick={() => handleCleanupAction("REMOVE_MEMBERS")}
                        className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1.5 cursor-pointer transition-all hover:underline"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        批量移出所有成员
                      </button>
                    )}

                    {activeTab === "assets" && details.assets?.length > 0 && (
                      <button
                        disabled={cleaning}
                        onClick={() => handleCleanupAction("UNBIND_ASSETS")}
                        className="text-xs text-red-600 hover:text-red-700 font-bold flex items-center gap-1.5 cursor-pointer transition-all hover:underline"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        批量解绑所有资产
                      </button>
                    )}
                  </div>

                  {/* Data List 列表项 */}
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {activeTab === "members" && (
                      details.members?.length > 0 ? (
                        details.members.map((member: any) => (
                          <div
                            key={member.id}
                            className="p-3.5 flex items-center justify-between hover:bg-blue-50/30 hover:translate-x-0.5 transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black flex items-center justify-center shrink-0 text-xs shadow-xs">
                                {member.name?.[0]?.toUpperCase() || "U"}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate">{member.name}</p>
                                <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                                  {member.email && member.email !== "未绑定邮箱" ? member.email : "未绑定企业邮箱"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-extrabold border border-slate-200/60">
                                {member.role || "MEMBER"}
                              </span>
                              <button
                                disabled={cleaning}
                                onClick={() => handleCleanupAction("REMOVE_SINGLE_MEMBER", member.id)}
                                className="px-3 py-1 text-xs bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-lg transition-all cursor-pointer font-black shadow-2xs hover:shadow-xs shrink-0"
                              >
                                移出
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>当前工作空间无其他协同团队成员</span>
                        </div>
                      )
                    )}

                    {activeTab === "assets" && (
                      details.assets?.length > 0 ? (
                        details.assets.map((asset: any) => (
                          <div
                            key={asset.id}
                            className="p-3.5 flex items-center justify-between hover:bg-blue-50/30 hover:translate-x-0.5 transition-all"
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
                                <Box className="w-4.5 h-4.5" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-black text-slate-800 truncate">{asset.name}</p>
                                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                                  分类：<span className="text-slate-600 font-bold">{asset.category || "通用资产"}</span> | 累计调用: <span className="text-blue-600 font-mono font-bold">{asset.usageCount}</span> 次
                                </p>
                              </div>
                            </div>
                            <button
                              disabled={cleaning}
                              onClick={() => handleCleanupAction("UNBIND_SINGLE_ASSET", asset.id)}
                              className="px-3 py-1 text-xs bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 rounded-lg transition-all cursor-pointer font-black shadow-2xs hover:shadow-xs shrink-0"
                            >
                              解绑
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="py-8 text-center text-xs text-slate-400 font-bold flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>当前工作空间未装配任何授权组件资产</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </>
          )}

        </div>

        {/* Footer 底部操作按钮栏：严格遵循规范按钮 Token */}
        <div className="px-6 py-4 bg-white border-t border-slate-200/80 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            取消
          </button>

          <div className="flex items-center gap-3">
            <button
              disabled={scanning || cleaning}
              onClick={runDissolveCheck}
              className="px-4 py-2.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-extrabold rounded-xl cursor-pointer transition-all flex items-center gap-2 shadow-2xs"
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
                className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white text-xs font-black rounded-xl shadow-md cursor-pointer transition-all flex items-center gap-2 active:scale-95 animate-bounce-subtle"
              >
                <span>下一步：确认解散空间</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                disabled
                className="px-5 py-2.5 bg-slate-200 text-slate-400 text-xs font-bold rounded-xl cursor-not-allowed transition-all"
              >
                请先清空资产与移出成员
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
