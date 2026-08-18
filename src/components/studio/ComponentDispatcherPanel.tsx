"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { X, Shield, ArrowRight, Layers, Database, FileText, CheckCircle2, ChevronRight, Activity, Star, TrendingUp, Code, FolderOpen, Layout, Server, Monitor, Users, ShieldCheck, FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { ComponentDefinition, COMPONENTS, COMPONENT_CATEGORIES } from "@/constants/components";

// 建立 Category 到 1-10 阶段的转换关系
const categoryToStageId: Record<string, number> = {
  BID_PREP: 1,
  REQ_DESIGN: 2,
  BACKEND_CORE: 3,
  DATABASE_ENG: 4,
  FRONTEND_DEV: 5,
  TEST_QA: 6,
  DEVOPS: 7,
  SECURITY: 8,
  PROJ_MGMT: 9,
  KNOWLEDGE: 10,
};

const getDispatcherStageIcon = (category: string, className?: string) => {
  const stageId = categoryToStageId[category] || 1;
  const iconProps = { className: className || "w-5 h-5 text-white" };
  switch (stageId) {
    case 1: return <FileText {...iconProps} />;
    case 2: return <Layers {...iconProps} />;
    case 3: return <Code {...iconProps} />;
    case 4: return <Database {...iconProps} />;
    case 5: return <Layout {...iconProps} />;
    case 6: return <CheckCircle2 {...iconProps} />;
    case 7: return <Server {...iconProps} />;
    case 8: return <ShieldCheck {...iconProps} />;
    case 9: return <Users {...iconProps} />;
    case 10: return <FolderOpen {...iconProps} />;
    default: return <Layers {...iconProps} />;
  }
};

// 辅助映射函数：获取各个阶段的输入材料与输出成果的物理载体描述
const getPhysicalDataMedia = (category: string) => {
  switch (category) {
    case "BID_PREP":
      return { inputMedia: "政府招标 PDF / 原始竞品文档", outputMedia: "结构化 Excel 偏离表 / 对比矩阵" };
    case "REQ_DESIGN":
      return { inputMedia: "会议纪要 / 用户故事原始叙述", outputMedia: "结构化 Markdown PRD / WBS 脑图" };
    case "BACKEND_CORE":
      return { inputMedia: "Swagger JSON / REST 协议文档", outputMedia: "TypeScript API 源码 / Swagger 契约" };
    case "DATABASE_ENG":
      return { inputMedia: "SQL DDL 脚本 / 实体描述", outputMedia: "数据库实体 ER 关系拓扑图" };
    case "FRONTEND_DEV":
      return { inputMedia: "Figma 设计稿元素 / UI 交互原型", outputMedia: "React TypeScript / Tailwind 组件源码" };
    case "TEST_QA":
      return { inputMedia: "业务代码源文件 / 功能描述", outputMedia: "Jest / Cypress 自动化单元测试用例" };
    case "DEVOPS":
      return { inputMedia: "项目配置文件 / 环境诉求说明", outputMedia: "Dockerfile 镜像构建 / CI-CD YAML 管道" };
    case "SECURITY":
      return { inputMedia: "源码仓库 / 数据库安全合规清单", outputMedia: "等保安全审计分析报告 / 修复指令集" };
    case "PROJ_MGMT":
      return { inputMedia: "团队排期任务 / WBS 节点描述", outputMedia: "动态甘特图 / WBS 进度任务物理排期表" };
    case "KNOWLEDGE":
      return { inputMedia: "项目源码注释 / 业务遗留文档", outputMedia: "自动对齐的 API 开发者中枢白皮书" };
    default:
      return { inputMedia: "原始参数输入 / JSON / 物理文档", outputMedia: "自动加工产出 / 代码 / 架构成果" };
  }
};

interface ComponentDispatcherPanelProps {
  isOpen: boolean;
  onClose: () => void;
  componentId: string | null;
  onNavigateToWorkspace?: (workspaceId: string, componentId: string) => void;
}

export default function ComponentDispatcherPanel({
  isOpen,
  onClose,
  componentId,
  onNavigateToWorkspace,
}: ComponentDispatcherPanelProps) {
  const toast = useToast();
  const router = useRouter();
  const {
    favorites,
    toggleFavorite,
    bindComponent,
    unbindComponent,
    userState,
  } = useAppContext();

  const isLoggedIn = userState?.isLoggedIn || false;
  const workspaces = userState?.workspaces || [];

  // 获取当前活跃的工作空间及绑定状态
  const activeWsId = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("workspaceId") || workspaces[0]?.id
    : workspaces[0]?.id;

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [bindingStatusMap, setBindingStatusMap] = useState<Record<string, boolean>>({});
  const [loadingStatuses, setLoadingStatuses] = useState<Record<string, boolean>>({});
  const [workspaceQuotas, setWorkspaceQuotas] = useState<Record<string, number>>({});
  const [loadingConfig, setLoadingConfig] = useState(true);

  // 初始化 selectedWorkspaceId
  useEffect(() => {
    if (activeWsId) {
      setSelectedWorkspaceId(activeWsId);
    } else if (workspaces.length > 0) {
      setSelectedWorkspaceId(workspaces[0].id);
    }
  }, [activeWsId, workspaces]);

  const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces.find(w => w.id === activeWsId) || workspaces[0] || null;
  const selectedWorkspaceName = selectedWorkspace ? selectedWorkspace.name : "默认空间";
  const isBound = selectedWorkspace ? (bindingStatusMap[selectedWorkspace.id] || false) : false;

  // 立即装配/使用中枢函数 (支持登录拦截与一键秒级装配跳转)
  const handleQuickUse = async () => {
    if (!comp) return;
    if (!isLoggedIn) {
      toast.info("智阁舟坊：请先登录账户以解锁装配效能组件");
      setTimeout(() => {
        onClose();
        router.push(`/auth/login?redirect=${encodeURIComponent(`/studio?componentId=${comp.id}`)}`);
      }, 800);
      return;
    }
    
    const targetWorkspace = workspaces.find(w => w.id === selectedWorkspaceId) || workspaces[0] || null;
    if (!targetWorkspace) {
      toast.warning("未检测到可用的工作空间，请先创建空间");
      return;
    }
    
    const wsId = targetWorkspace.id;
    const wsName = targetWorkspace.name;
    const targetIsBound = bindingStatusMap[wsId] || false;
    
    if (targetIsBound) {
      // 已经装配，直接进入空间研发页
      handleGoToWorkspace(wsId);
    } else {
      toast.info(`正在为您的一键算力空间 [${wsName}] 快速装配引进该效能组件...`);
      try {
        const success = await bindComponent(comp.id, wsId);
        if (success) {
          toast.success("装配成功！正在为您载入智阁极客工作流...");
          setBindingStatusMap(prev => ({ ...prev, [wsId]: true }));
          setTimeout(() => {
            handleGoToWorkspace(wsId);
          }, 800);
        } else {
          toast.error("装配引进失败，请重试");
        }
      } catch (err) {
        toast.error("网络异常，请稍后重试");
      }
    }
  };

  // 新增：契约沙箱仿真模拟器状态
  const [simState, setSimState] = useState<"idle" | "running" | "success">("idle");
  const [simLogs, setSimLogs] = useState<string[]>([]);

  const comp = COMPONENTS.find((c) => c.id === componentId) || null;

  // 监听组件切换，重置沙箱状态
  useEffect(() => {
    setSimState("idle");
    setSimLogs([]);
  }, [componentId]);

  // 启动仿真器运行模拟日志流
  const runSimulator = () => {
    if (simState === "running" || !comp) return;
    setSimState("running");
    setSimLogs([]);

    const logs = [
      `[${new Date().toLocaleTimeString()}] [INFO] 初始化数据流测试环境，正为组件 ${comp.id} 加载输入协议定义...`,
      `[${new Date().toLocaleTimeString()}] [INFO] 正在对输入协议 (Input Schema) 执行格式验证与结构比对...`,
      `[${new Date().toLocaleTimeString()}] [INFO] 验证通过：输入数据格式符合规范，未检测到校验异常。`,
      `[${new Date().toLocaleTimeString()}] [INFO] 执行引擎核心逻辑计算中，正在进行数据转换与逻辑处理...`,
      `[${new Date().toLocaleTimeString()}] [INFO] 数据处理与边界校验已完成，各项逻辑检查通过。`,
      `[${new Date().toLocaleTimeString()}] [SUCCESS] 模拟运行成功！成果文件已就绪，等待装配发布。`
    ];

    let i = 0;
    const interval = setInterval(() => {
      if (i < logs.length) {
        setSimLogs((prev) => [...prev, logs[i]]);
        i++;
      } else {
        clearInterval(interval);
        setSimState("success");
        toast.success("沙箱模拟运行成功！");
      }
    }, 250);
  };

  // 1. 获取各个空间对于该组件的绑定状态，并同步拉取配额
  useEffect(() => {
    if (!isOpen || !componentId || !isLoggedIn) return;

    const fetchStates = async () => {
      setLoadingConfig(true);
      const statusMap: Record<string, boolean> = {};
      const quotaMap: Record<string, number> = {};

      try {
        const userId = localStorage.getItem("userId") || userState.userInfo?.id;
        const headers: Record<string, string> = userId ? { Authorization: `Bearer ${userId}` } : {};

        // A. 批量并发获取每个空间的组件绑定状态
        await Promise.all(
          workspaces.map(async (ws) => {
            try {
              const res = await fetch(`/api/studio?action=bound&workspaceId=${ws.id}`, { headers });
              if (res.ok) {
                const resData = await res.json();
                if (resData.success && Array.isArray(resData.data)) {
                  statusMap[ws.id] = resData.data.includes(componentId);
                }
              }
            } catch (e) {
              console.error(`加载空间 ${ws.id} 绑定状态失败:`, e);
            }
          })
        );

        // B. 一次性获取所有空间算力配额
        try {
          const res = await fetch("/api/user/workspace-hub/quota", { headers });
          if (res.ok) {
            const resData = await res.json();
            if (resData.success && resData.data?.workspaces) {
              resData.data.workspaces.forEach((w: any) => {
                if (w.quota) {
                  quotaMap[w.id] = Number(w.quota.tokenBalance);
                }
              });
            }
          }
        } catch (e) {
          console.error("加载算力配额失败:", e);
        }

        setBindingStatusMap(statusMap);
        setWorkspaceQuotas(quotaMap);
      } catch (err) {
        console.warn("加载分发控制台数据失败:", err);
      } finally {
        setLoadingConfig(false);
      }
    };

    fetchStates();
  }, [isOpen, componentId, isLoggedIn, workspaces, userState.userInfo?.id]);

  if (!isOpen || !comp) return null;

  const categoryInfo = COMPONENT_CATEGORIES[comp.category];
  const isFav = favorites.includes(comp.id);
  const media = getPhysicalDataMedia(comp.category);

  // 2. 处理绑定/解绑切换动作
  const handleToggleBind = async (workspaceId: string, workspaceName: string) => {
    const wasBound = bindingStatusMap[workspaceId] || false;
    
    // �  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
      {/* 背景遮罩 */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[4px] transition-opacity"
      />

      {/* 居中大规格便当盒模态框 (ZhiGe Bento Spec Modal) */}
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[750px] bg-[#f0f8ff] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-250 border border-slate-200 z-10">
        
        {/* 顶部 Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md">
              {getDispatcherStageIcon(comp.category)}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
                <span>{comp.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 font-bold rounded">
                  {comp.id}
                </span>
              </h2>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                {isLoggedIn ? "资产技术说明与分发部署控制台" : "产品效能资产使用说明书"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isLoggedIn && (
              <button
                onClick={handleToggleFavorite}
                className={`w-8 h-8 rounded-full border flex items-center justify-center cursor-pointer transition-colors shadow-sm ${
                  isFav ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 bg-white text-slate-400 hover:border-amber-500 hover:text-amber-500"
                }`}
                title="收藏本组件"
              >
                <Star className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* 极客双列 Bento 内容区分栏 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* 左侧详情与沙箱仿真栏 (占 7 列) */}
          <div className="lg:col-span-7 h-full overflow-y-auto p-5 md:p-6 space-y-6 border-r border-slate-200 scrollbar-thin">
            
            {/* 1. 基本信息看板 */}
            <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="px-2.5 py-0.5 rounded text-[10px] font-bold border"
                  style={{
                    backgroundColor: `${categoryInfo?.color}10`,
                    borderColor: `${categoryInfo?.color}20`,
                    color: categoryInfo?.color,
                  }}
                >
                  {categoryInfo?.name || "常规分类"}
                </span>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                  <Activity className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>估算消耗 {comp.estimatedTokens} Token/次</span>
                </div>
              </div>
              
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                {comp.description}
              </p>

              {comp.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {comp.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 2. 技术数据契约流转拓扑 (Topology Data Contract) */}
            <section className="space-y-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-1">
                <Database className="w-4 h-4 text-[#3182ce]" />
                数据加工流转契约协议 (物理材料 ➜ 物理产出)
              </h3>
              
              {/* 极客风深色流转拓扑图 */}
              <div className="relative bg-slate-900 text-slate-100 rounded-2xl p-5 border border-slate-800 shadow-xl overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25"></div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>

                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
                  {/* 输入材料极 */}
                  <div className="flex-1 w-full bg-slate-950/80 rounded-xl p-4 border border-slate-800 shadow-inner flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        输入材料规范 (Input Material)
                      </div>
                      <div className="font-mono text-[10.5px] text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-900 min-h-[50px] flex items-center">
                        {comp.previewData.inputMock}
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                      <span>物理载体:</span>
                      <span className="text-blue-300 bg-blue-950/50 border border-blue-900/30 px-1.5 py-0.5 rounded truncate">
                        {media.inputMedia}
                      </span>
                    </div>
                  </div>

                  {/* 流转引擎连接枢纽 */}
                  <div className="flex flex-col items-center justify-center shrink-0 py-2 md:w-16">
                    {/* 横向箭头与流光 */}
                    <div className="hidden md:flex flex-col items-center gap-1">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[10px] font-black shadow-lg shadow-blue-500/20 border border-blue-400/25">
                        中枢
                      </div>
                      <span className="text-[7.5px] font-black text-indigo-400 uppercase tracking-widest scale-75 mt-0.5 whitespace-nowrap">数据解构</span>
                      <div className="w-12 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 rounded-full relative overflow-hidden mt-1 shadow-inner">
                        <div className="absolute inset-0 bg-white/40 translate-x-[-100%] animate-[flow_2s_infinite_linear]"></div>
                      </div>
                    </div>

                    {/* 移动端纵向箭头 */}
                    <div className="flex md:hidden flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shadow">
                        ↓
                      </div>
                    </div>
                  </div>

                  {/* 输出成果极 */}
                  <div className="flex-1 w-full bg-slate-950/80 rounded-xl p-4 border border-slate-800 shadow-inner flex flex-col justify-between min-h-[140px]">
                    <div>
                      <div className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        输出成果契约 (Output Artifact)
                      </div>
                      <div className="font-mono text-[10.5px] text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-900 min-h-[50px] flex items-center">
                        {comp.previewData.outputMock}
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-900 flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
                      <span>物理产出:</span>
                      <span className="text-emerald-300 bg-emerald-950/50 border border-emerald-900/30 px-1.5 py-0.5 rounded truncate">
                        {media.outputMedia}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 契约基本属性 */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-[9px] font-black text-slate-500">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 全程沙箱校验</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 数据隔离加密</span>
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 吞吐契合率 100%</span>
                </div>
              </div>
            </section>

            {/* 3. 契约沙箱仿真模拟器 (Simulator Panel) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-800 flex items-center gap-1.5">
                  <FlaskConical className="w-4 h-4 text-[#38a169]" />
                  <span>契约加工沙箱仿真模拟 (Zero Sandbox Trial)</span>
                </span>
                {simState === "running" ? (
                  <span className="text-[8px] font-black text-blue-500 animate-pulse bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    仿真分析中...
                  </span>
                ) : simState === "success" ? (
                  <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-250 px-1.5 py-0.5 rounded">
                    测试通过
                  </span>
                ) : (
                  <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    沙盒闲置
                  </span>
                )}
              </div>

              {simState === "idle" ? (
                /* 闲置欢迎区 */
                <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl text-center space-y-3 shadow-inner">
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                    想查看该组件如何进行数据比对并转换输出吗？一键启动沙盒测试，在虚拟控制台中预览比对验证及日志输出流。
                  </p>
                  <button
                    onClick={runSimulator}
                    className="h-8 px-4 bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black rounded-lg shadow transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                  >
                    <span>启动数据沙盒测试</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                /* 运行/仿真成功日志控制台 */
                <div className="space-y-3">
                  <div className="bg-slate-950 text-slate-400 rounded-xl p-3.5 border border-slate-800 shadow-inner font-mono text-[10px] leading-relaxed space-y-1.5 max-h-[160px] overflow-y-auto scrollbar-thin">
                    {simLogs.map((log, index) => (
                      <div key={index} className="transition-all animate-[fadeIn_0.2s_ease-out]">
                        {log}
                      </div>
                    ))}
                    {simState === "running" && (
                      <div className="flex items-center gap-1 text-slate-500">
                        <span>[系统运行] 📡 数据分析中</span>
                        <span className="w-1.5 h-3.5 bg-slate-400 animate-[blink_1s_infinite]"></span>
                      </div>
                    )}
                  </div>

                  {simState === "success" && (
                    /* 仿真成功成果大卡片 */
                    <div className="bg-emerald-50/15 border border-emerald-100 rounded-xl p-3.5 space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <div className="text-[9px] font-black text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>仿真调试成果物验证完毕 (Artifact Checksum Validated)</span>
                      </div>
                      <div className="bg-slate-900/5 rounded-lg p-2.5 text-[10.5px] font-bold text-slate-600 font-mono leading-relaxed border border-emerald-200/50">
                        {comp.previewData.outputMock}
                      </div>
                      
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold pt-1">
                        <span>仿真环境: ZhiGe Sandboxed Cluster v1.2</span>
                        <button
                          onClick={() => setSimState("idle")}
                          className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        >
                          重置仿真
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 可视化 ROI 商业提效滑轨 */}
            <div className="bg-gradient-to-r from-emerald-50/40 via-blue-50/20 to-teal-50/30 border border-emerald-100 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col sm:flex-row items-center gap-4 justify-between">
              <div className="space-y-1 w-full sm:max-w-[70%]">
                <span className="text-[11px] font-black text-emerald-700 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>商业级投入产出比 (ROI Efficiency Matrix)</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block leading-relaxed">
                  {comp.previewData.roiText}
                </span>
              </div>
              
              {/* 可视化进度提效滑条 */}
              <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-inner shrink-0 w-full sm:w-[120px] text-center space-y-1">
                <span className="text-[8px] font-black text-slate-400 block tracking-wider uppercase">提效比例</span>
                <span className="text-sm font-black text-emerald-600 block leading-none font-mono">
                  {comp.category === "BID_PREP" || comp.category === "REQ_DESIGN" ? "85% +" : "3.5 倍（效能飞跃）"}
                </span>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
                    style={{ width: comp.category === "BID_PREP" || comp.category === "REQ_DESIGN" ? "85%" : "100%" }}
                  ></div>
                </div>
              </div>
            </div>

          </div>

          {/* 右侧空间部署与路由栏 (占 5 列) */}
          <div className="lg:col-span-5 h-full overflow-y-auto p-5 md:p-6 bg-slate-50/40 scrollbar-thin flex flex-col justify-between border-l border-slate-200">
            <div className="space-y-5">
              
              {/* 🚀 智能路由中枢 (ZhiGe Dynamic Routing Hub) */}
              <section className="bg-gradient-to-br from-[#3182ce]/5 to-indigo-50/30 border border-blue-200/80 rounded-2xl p-4 flex flex-col gap-3.5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#3182ce]/10 to-indigo-500/5 rounded-full blur-xl pointer-events-none"></div>
                <div className="space-y-1 min-w-0 relative z-10 flex-1">
                  <span className="text-[9px] font-black text-[#3182ce] uppercase tracking-wider block">
                    ZhiGe Routing Hub · 准备就绪的运行目标
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-black text-slate-800 truncate">
                      {selectedWorkspaceName}
                    </span>
                    {selectedWorkspace?.type === "PERSONAL" ? (
                      <span className="text-[8px] px-1.5 py-0.2 bg-blue-50 text-[#3182ce] border border-blue-100 rounded font-semibold scale-90">个人</span>
                    ) : selectedWorkspace ? (
                      <span className="text-[8px] px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-100 rounded font-semibold scale-90">企业</span>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-slate-400 font-bold flex items-center gap-1 mt-1">
                    <span>绑定状态:</span>
                    {isBound ? (
                      <span className="text-emerald-500 font-black flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> 已装配引进
                      </span>
                    ) : (
                      <span className="text-slate-400 font-black flex items-center gap-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span> 未引进 (使用将自动静默装配)
                      </span>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={handleQuickUse}
                  className="w-full h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-black rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 z-10"
                >
                  <Layers className="w-3.5 h-3.5 fill-current text-white/20" />
                  <span>立即使用</span>
                </button>
              </section>

              {/* 3. 跨空间分发与绑定矩阵 (Dispatch Matrix) */}
              <section className="space-y-3">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-1">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  工作空间分发绑定矩阵
                </h3>

                {!isLoggedIn ? (
                  // 游客提示
                  <div className="bg-amber-50/30 border border-amber-100 rounded-2xl p-6 text-center shadow-sm space-y-4">
                    <div>
                      <p className="text-xs text-amber-700 font-bold">您当前为游客模式，无法进行空间绑定。</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">请登录系统，以在企业协作或个人开发沙盒中装配此效能资产。</p>
                    </div>
                    <button
                      onClick={handleQuickUse}
                      className="w-full h-10 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-blue-700 text-white text-xs font-black rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4 text-white/40" />
                      <span>立即使用</span>
                    </button>
                  </div>
                ) : loadingConfig ? (
                  // 加载中
                  <div className="bg-white rounded-2xl p-8 border border-slate-200/60 shadow-sm flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-2" />
                    <p className="text-[11px] text-slate-400 font-bold">读取各个空间部署矩阵...</p>
                  </div>
                ) : workspaces.length === 0 ? (
                  // 空间为空
                  <div className="bg-white rounded-2xl p-6 border border-slate-200 border-dashed text-center">
                    <p className="text-xs text-slate-500 font-bold">您目前暂无可用工作空间</p>
                    <p className="text-[10px] text-slate-400 mt-1">请返回主台创建默认开发空间</p>
                  </div>
                ) : (
                  // 空间部署 Checklist
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {workspaces.map((ws) => {
                        const isWsBound = bindingStatusMap[ws.id] || false;
                        const isSelected = selectedWorkspaceId === ws.id;
                        const isProcessing = loadingStatuses[ws.id] || false;
                        const tokenBalance = workspaceQuotas[ws.id] || 0;

                        return (
                          <div
                            key={ws.id}
                            onClick={() => setSelectedWorkspaceId(ws.id)}
                            className={`border rounded-2xl p-3.5 flex items-center justify-between transition-all shadow-sm cursor-pointer relative group ${
                              isSelected
                                ? "border-[#3182ce] ring-2 ring-[#3182ce]/10 bg-[#f0f8ff]/35"
                                : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50/20"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* 空间激活单选指示器 */}
                              <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all ${
                                isSelected ? "border-[#3182ce] bg-[#3182ce]" : "border-slate-300"
                              }`}>
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                              </div>
                              
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-black text-slate-800 truncate">{ws.name}</span>
                                  {ws.type === "PERSONAL" ? (
                                    <span className="text-[8px] px-1 py-0.2 bg-slate-100 text-slate-400 rounded flex-shrink-0 font-semibold scale-90">个人</span>
                                  ) : (
                                    <span className="text-[8px] px-1 py-0.2 bg-amber-50 text-amber-500 rounded border border-amber-100 flex-shrink-0 font-semibold scale-90">企业</span>
                                  )}
                                  
                                  {/* 极其精致的装配状态小微标 */}
                                  {isWsBound ? (
                                    <span className="text-[8px] px-1.5 py-0.2 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex-shrink-0 font-black scale-90 flex items-center gap-0.5">
                                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                      已装配
                                    </span>
                                  ) : (
                                    <span className="text-[8px] px-1.5 py-0.2 bg-slate-50 text-slate-400 rounded-full border border-slate-200/60 flex-shrink-0 font-semibold scale-90">
                                      未引进
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-bold mt-0.5 flex items-center gap-1.5">
                                  <span>算力余额:</span>
                                  <span className={tokenBalance < 100 ? "text-red-500 font-black" : "text-slate-600 font-black"}>
                                    {tokenBalance.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 右侧智能行动区 */}
                            <div className="flex items-center gap-2">
                              {isProcessing ? (
                                <div className="w-6 h-6 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin"></div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedWorkspaceId(ws.id);
                                    setTimeout(handleQuickUse, 50);
                                  }}
                                  className={`h-8 px-3 text-[10px] font-black rounded-lg transition-all flex items-center gap-0.5 cursor-pointer shadow-sm border ${
                                    isSelected
                                      ? "text-white bg-[#3182ce] border-[#3182ce] hover:bg-[#2b6cb0]"
                                      : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200"
                                  }`}
                                >
                                  <span>{isWsBound ? "进入运行" : "装配并运行"}</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

            </div>
          </div>
          
        </div>

      </div>
    </div>
  );00 rounded-full border border-emerald-100 flex-shrink-0 font-black scale-90 flex items-center gap-0.5">
                                  <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
                                  已装配
                                </span>
                              ) : (
                                <span className="text-[8px] px-1.5 py-0.2 bg-slate-50 text-slate-400 rounded-full border border-slate-200/60 flex-shrink-0 font-semibold scale-90">
                                  未引进
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mt-0.5 flex items-center gap-1.5">
                              <span>算力余额:</span>
                              <span className={tokenBalance < 100 ? "text-red-500 font-black" : "text-slate-600 font-black"}>
                                {tokenBalance.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* 右侧智能行动区 */}
                        <div className="flex items-center gap-2">
                          {isProcessing ? (
                            <div className="w-6 h-6 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin"></div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWorkspaceId(ws.id);
                                setTimeout(handleQuickUse, 50);
                              }}
                              className={`h-8 px-3 text-[10px] font-black rounded-lg transition-all flex items-center gap-0.5 cursor-pointer shadow-sm border ${
                                isSelected
                                  ? "text-white bg-[#3182ce] border-[#3182ce] hover:bg-[#2b6cb0]"
                                  : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200"
                              }`}
                            >
                              <span>{isWsBound ? "进入运行" : "装配并运行"}</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </div>

      </div>
    </div>
  );
}
