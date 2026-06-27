"use client";

import React, { useState } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { COMPONENTS } from "@/constants/components";
import { Play, RotateCcw, ShieldCheck, Terminal, AlertCircle, Copy, PlayCircle, Upload } from "lucide-react";

interface ComponentExecutionProps {
  componentId: string;
  workspaceId: string;
  workspaceName: string;
  restrictedComponentIds: string[];
  workspaceToken: number;
  onTokenUpdate: (newToken: number) => void;
}

export default function ComponentExecution({
  componentId,
  workspaceId,
  workspaceName,
  restrictedComponentIds,
  workspaceToken,
  onTokenUpdate,
}: ComponentExecutionProps) {
  const toast = useToast();
  const { userState } = useAppContext();
  
  const comp = COMPONENTS.find((c) => c.id === componentId);
  const cost = comp?.estimatedTokens || 5;

  const [inputData, setInputData] = useState(comp?.previewData?.inputMock || "");
  const [outputData, setOutputData] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);
  const [inputError, setInputError] = useState(false);

  if (!comp) return null;

  const isRestricted = restrictedComponentIds.includes(componentId);

  const handleSimulateRun = async () => {
    if (isRestricted) {
      toast.error("您当前的岗位在当前工作空间下无此组件的执行权限，请联系管理员");
      return;
    }
    if (!inputData.trim()) {
      setInputError(true);
      toast.error("运行输入参数不能为空，请输入或加载分析数据");
      return;
    }
    if (!workspaceId) {
      toast.warning("暂无可用工作空间，无法运行组件服务");
      return;
    }
    if (workspaceToken < cost) {
      toast.error("当前工作空间算力 Token 余额不足，请联系管理员充值");
      return;
    }

    setIsSimulating(true);
    toast.info(`正在初始化安全沙箱，预计消耗 ${cost} 点算力...`);

    try {
      const userId = userState.userInfo?.id || localStorage.getItem("userId");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userId) {
        headers["Authorization"] = `Bearer ${userId}`;
      }

      const response = await fetch("/api/studio", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "simulate",
          componentId,
          workspaceId,
          tokens: cost,
        }),
      });

      const result = await response.json();
      if (result.success) {
        onTokenUpdate(result.tokenBalance);
        setOutputData(
          comp.previewData?.outputMock || 
          `[系统输出] 组件 ${comp.name} 服务运行成功！\n- 安全审计ID: ${crypto.randomUUID()}\n- 算力扣减: -${cost} Token\n- 运行状态: COMPLETED\n- 数据返回值: 200 OK`
        );
        toast.success(`组件运行成功！已从空间 [${workspaceName}] 扣减 ${cost} 算力，余额 ${result.tokenBalance}。`);
      } else {
        toast.error(result.error || "运行失败");
      }
    } catch (e) {
      console.error(e);
      toast.error("运行失败，网络连接异常");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleReset = () => {
    setInputData("");
    setOutputData("");
    setInputError(false);
    toast.success("输入与运行输出已完全清空");
  };

  const handleLoadDemo = () => {
    setInputData(comp.previewData?.inputMock || "");
    setInputError(false);
    toast.success("预设 Demo 数据加载成功");
  };

  const handleCopyOutput = () => {
    if (!outputData) return;
    navigator.clipboard.writeText(outputData);
    toast.success("运行输出已成功复制到剪贴板！");
  };

  return (
    <div className="space-y-4">
      {/* 状态警示 */}
      {isRestricted && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-500 font-bold flex items-start gap-1.5 animate-in fade-in duration-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0 animate-pulse" />
          <span>您当前的岗位在当前工作空间下无此组件的执行权限，请联系管理员开通岗位权限</span>
        </div>
      )}

      {/* 控制台容器 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* 输入面板 */}
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-bold text-slate-800 block">组件输入参数与数据源</span>
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={isSimulating || isRestricted}
              className="text-xs text-[#3182ce] hover:text-[#2b6cb0] font-bold flex items-center gap-1 transition-colors cursor-pointer bg-blue-50/50 hover:bg-blue-50 px-2 py-0.5 rounded border border-blue-100/60"
              title="一键加载组件的预设 Demo 调试参数"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              <span>加载预设 Demo</span>
            </button>
          </div>

          {/* 高颜值虚线文件拖拽/选择上传模拟区 */}
          <div className="mb-3.5">
            <label className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 hover:border-[#3182ce] bg-slate-50/50 hover:bg-blue-50/20 rounded-[8px] cursor-pointer transition-all group overflow-hidden">
              <div className="flex flex-col items-center justify-center pt-4 pb-4 text-center px-4">
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-[#3182ce] transition-colors mb-2" />
                <p className="text-sm text-slate-700 font-bold group-hover:text-[#3182ce] transition-colors">
                  点击或拖拽招标文件/数据源文件至此上传
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  支持 PDF, Word, Excel, TXT (最大 50MB)
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                disabled={isSimulating || isRestricted}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  const mockSha256 = Array.from({ length: 64 }, () => 
                    Math.floor(Math.random() * 16).toString(16)
                  ).join("");
                  
                  const fileData = {
                    fileMetadata: {
                      name: file.name,
                      sizeBytes: file.size,
                      formattedSize: `${(file.size / 1024).toFixed(2)} KB`,
                      mimeType: file.type || "application/octet-stream",
                      sha256Checksum: mockSha256
                    },
                    sandboxConfig: {
                      isolateEnvironment: true,
                      encryptionAlgorithm: "AES-256-GCM",
                      retentionPolicy: "DESTROY_ON_COMPLETION",
                      executionTimeoutSeconds: 300
                    },
                    instructions: "提取文档中的资质门槛、偏离项，并进行结构化合规审计分析。"
                  };
                  
                  setInputData(JSON.stringify(fileData, null, 2));
                  setInputError(false);
                  toast.success(`文件 [${file.name}] 上传成功！已将其元数据结构化为分析参数。`);
                }}
              />
            </label>
          </div>

          <textarea
            value={inputData}
            onChange={(e) => {
              setInputData(e.target.value);
              setInputError(false);
            }}
            disabled={isSimulating || isRestricted}
            placeholder="请输入待分析的内容或上传的数据参数..."
            className={`w-full h-28 p-3 bg-slate-50 border rounded-[8px] text-xs font-mono text-slate-700 placeholder-slate-400 focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce]/20 resize-none font-bold ${
              inputError ? "border-red-500 bg-red-50/10 focus:border-red-500 focus:ring-red-100" : "border-slate-200"
            }`}
          />

          {/* 算力不足的橙色警示卡片 */}
          {workspaceToken < cost && !isRestricted && (
            <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-[8px] text-xs text-amber-700 font-bold flex items-start gap-1.5 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-extrabold text-[#dd6b20]">算力配额不足（当前余额: {workspaceToken} Tokens / 运行需消耗: {cost} Tokens）</p>
                <p className="text-slate-500 font-medium mt-0.5 leading-normal">
                  当前工作空间可用算力不足，请联系空间管理员或所有者补充 Token 配额。
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 运行控制栏 */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-left">
            <div className="flex items-center gap-1 text-xs text-slate-600 font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              <span>单次运行消耗: </span>
              <strong className="text-[#3182ce] font-extrabold">{cost} 点算力</strong>
            </div>
            <div className="hidden sm:block h-3.5 w-px bg-slate-200" />
            <div className="text-xs font-semibold text-slate-500">
              空间余额:{" "}
              <span className={`font-extrabold ${workspaceToken < cost ? "text-red-500" : "text-slate-700"}`}>
                {workspaceToken} Tokens
              </span>
            </div>
          </div>

          <div className="flex gap-2 self-end sm:self-auto">
            <button
              onClick={handleReset}
              disabled={isSimulating || isRestricted}
              className="px-3 h-8 text-xs font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-[4px] transition-all cursor-pointer flex items-center gap-1 shadow-sm"
            >
              <RotateCcw className="w-3 h-3" />
              <span>重置清空</span>
            </button>
            <button
              onClick={handleSimulateRun}
              disabled={isSimulating || isRestricted || workspaceToken < cost}
              className={`px-4 h-8 text-xs font-black text-white rounded-[4px] transition-all flex items-center gap-1 shadow-md cursor-pointer ${
                isSimulating || isRestricted || workspaceToken < cost
                  ? "bg-slate-300 shadow-none cursor-not-allowed"
                  : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5"
              }`}
            >
              {isSimulating ? (
                <>
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>服务运行中...</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>运行组件服务</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 输出终端 */}
        <div className="p-4 bg-slate-950 text-slate-200">
          <div className="flex items-center justify-between mb-2 text-left">
            <span className="text-sm font-bold text-slate-300 flex items-center gap-1">
              <Terminal className="w-3.5 h-3.5" />
              运行结果与审计日志
            </span>
            <div className="flex items-center gap-2">
              {outputData && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    className="text-xs text-[#3182ce] bg-blue-950 hover:bg-blue-900 border border-blue-800/60 hover:border-blue-700/80 px-2 py-1 rounded flex items-center gap-1 font-bold cursor-pointer transition-colors"
                    title="复制控制台输出内容到剪贴板"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    <span>复制输出</span>
                  </button>
                  <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold">
                    200 SUCCESS
                  </span>
                </>
              )}
            </div>
          </div>
          <pre className="h-32 p-3 bg-black/40 rounded border border-slate-800 text-xs text-slate-300 font-mono overflow-y-auto leading-relaxed whitespace-pre-wrap font-bold select-text text-left">
            {outputData || "[系统就绪] 请配置上方输入参数或上传文档，然后点击 '运行组件服务' 开始执行分析..."}
          </pre>
        </div>
      </div>
    </div>
  );
}
