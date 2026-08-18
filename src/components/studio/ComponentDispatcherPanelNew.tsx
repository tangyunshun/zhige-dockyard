"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { X, Shield, ArrowRight, Layers, Database, FileText, CheckCircle2, ChevronRight, Activity, Star, TrendingUp, Code, FolderOpen, Layout, Server, Monitor, Users, ShieldCheck, FlaskConical, Coins, Cpu } from "lucide-react";
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

  const categoryInfo = COMPONENTS.find(c => c.id === componentId) 
    ? COMPONENT_CATEGORIES[comp.category] 
    : null;
  const isFav = favorites.includes(comp.id);
  const media = getPhysicalDataMedia(comp.category);

  // 2. 处理绑定/解绑切换动作
  const handleToggleBind = async (workspaceId: string, workspaceName: string) => {
    const wasBound = bindingStatusMap[workspaceId] || false;
    
    // 设置局部加载菊花
    setLoadingStatuses((prev) => ({ ...prev, [workspaceId]: true }));

    try {
      if (wasBound) {
        const success = await unbindComponent(comp.id, workspaceId);
        if (success) {
          setBindingStatusMap((prev) => ({ ...prev, [workspaceId]: false }));
          toast.success(`组件 ${comp.name} 已成功从空间 [${workspaceName}] 解除引进`);
        } else {
          toast.error("操作失败，请重试");
        }
      } else {
        const success = await bindComponent(comp.id, workspaceId);
        if (success) {
          setBindingStatusMap((prev) => ({ ...prev, [workspaceId]: true }));
          toast.success(`组件 ${comp.name} 已成功分发至空间 [${workspaceName}]`);
        } else {
          toast.error("操作失败，请重试");
        }
      }
    } catch (e) {
      console.error("切换组件绑定失败:", e);
      toast.error("网络异常，请重试");
    } finally {
      setLoadingStatuses((prev) => ({ ...prev, [workspaceId]: false }));
    }
  };

  const handleToggleFavorite = async () => {
    if (!isLoggedIn) {
      toast.error("请先登录系统以收藏组件");
      return;
    }
    const success = await toggleFavorite(comp.id);
    if (success) {
      toast.success(isFav ? "已取消收藏" : "已添加到收藏");
    } else {
      toast.error("操作失败");
    }
  };

  const handleGoToWorkspace = (workspaceId: string) => {
    if (onNavigateToWorkspace) {
      onNavigateToWorkspace(workspaceId, comp.id);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 overflow-hidden animate-in fade-in duration-200">
      {/* 背景遮罩 */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[5px] transition-opacity"
      />

      {/* 居中大规格便当盒模态框 (ZhiGe Bento Spec Modal) */}
      <div className="relative w-full max-w-4xl h-[85vh] max-h-[700px] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-98 duration-200 border border-slate-200/80 z-10">
        
        {/* 顶部 Header - 紧凑精美 */}
        <header className="bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between flex-shrink-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm">
              {getDispatcherStageIcon(comp.category, "w-4.5 h-4.5 text-white")}
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-1.5">
                <span>{comp.name}</span>
                <span className="text-[9px] px-1 py-0.2 bg-slate-100 text-slate-500 font-mono rounded">
                  {comp.id}
                </span>
              </h2>
              <p className="text-[9.5px] text-slate-400 font-bold mt-0.5">
                {isLoggedIn ? "资产技术说明与分发部署控制台" : "产品效能资产使用说明书"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isLoggedIn && (
              <button
                onClick={handleToggleFavorite}
                className={`w-7.5 h-7.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all shadow-sm ${
                  isFav 
                    ? "border-amber-300 bg-amber-50 text-amber-500 hover:bg-amber-100" 
                    : "border-slate-200 bg-white text-slate-400 hover:border-slate-400 hover:text-slate-600"
                }`}
                title="收藏本组件"
              >
                <Star className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7.5 h-7.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-all cursor-pointer shadow-sm"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 极客双列 Bento 内容区分栏 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* 左侧详情与沙箱仿真栏 (占 7 列) - 纯白大气底色 */}
          <div className="lg:col-span-7 h-full overflow-y-auto p-5 space-y-5 scrollbar-thin">
            
            {/* 1. 基本信息看板 - 扁平无边框设计 */}
            <section className="bg-slate-50/50 rounded-xl p-4.5 border border-slate-150 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[9px] font-black border"
                  style={{
                    backgroundColor: `${categoryInfo?.color}10`,
                    borderColor: `${categoryInfo?.color}20`,
                    color: categoryInfo?.color,
                  }}
                >
                  {categoryInfo?.name || "常规分类"}
                </span>
                <div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
                  <Activity className="w-3.5 h-3.5 text-[#f59e0b]" />
                  <span>估算消耗 {comp.estimatedTokens} Token/次</span>
                </div>
              </div>
              
              <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                {comp.description}
              </p>

              {comp.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {comp.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 bg-white text-slate-500 border border-slate-150 text-[9px] font-bold rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* 2. 技术数据契约流转拓扑 (Topology Data Contract) - 精致轻量深色面板 */}
            <section className="space-y-2.5">
              <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                <Database className="w-3.5 h-3.5 text-[#3182ce]" />
                数据加工流转契约协议 (物理材料 - 物理产出)
              </h3>
              
              <div className="relative bg-[#0f172a] text-slate-200 rounded-xl p-4 border border-slate-800 shadow-md overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-15"></div>

                <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-3">
                  {/* 输入材料极 */}
                  <div className="flex-1 w-full bg-slate-950/90 rounded-lg p-3 border border-slate-900 shadow-inner flex flex-col justify-between min-h-[105px]">
                    <div>
                      <div className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                        输入材料规范 (Input)
                      </div>
                      <div className="font-mono text-[9.5px] text-slate-400 leading-relaxed bg-slate-900/50 p-2 rounded border border-slate-800/80 min-h-[40px] flex items-center">
                        {comp.previewData.inputMock}
                      </div>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-900 flex items-center gap-1 text-[8.5px] font-bold text-slate-500">
                      <span>载体:</span>
                      <span className="text-blue-300 bg-blue-950/40 border border-blue-900/20 px-1 py-0.2 rounded truncate max-w-[100px]">
                        {media.inputMedia}
                      </span>
                    </div>
                  </div>

                  {/* 中枢枢纽 */}
                  <div className="flex flex-col items-center justify-center shrink-0 sm:w-10">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-center text-white text-[8px] font-black shadow-md border border-blue-400/20">
                      中枢
                    </div>
                    <span className="text-[6.5px] font-black text-indigo-400 uppercase tracking-widest scale-90 mt-1 whitespace-nowrap hidden sm:block">数据流转</span>
                  </div>

                  {/* 输出成果极 */}
                  <div className="flex-1 w-full bg-slate-950/90 rounded-lg p-3 border border-slate-900 shadow-inner flex flex-col justify-between min-h-[105px]">
                    <div>
                      <div className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        输出成果契约 (Output)
                      </div>
                      <div className="font-mono text-[9.5px] text-slate-400 leading-relaxed bg-slate-900/50 p-2 rounded border border-slate-800/80 min-h-[40px] flex items-center">
                        {comp.previewData.outputMock}
                      </div>
                    </div>
                    <div className="mt-2 pt-1.5 border-t border-slate-900 flex items-center gap-1 text-[8.5px] font-bold text-slate-500">
                      <span>产出:</span>
                      <span className="text-emerald-300 bg-emerald-950/40 border border-emerald-900/20 px-1 py-0.2 rounded truncate max-w-[100px]">
                        {media.outputMedia}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 契约基本属性 */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between flex-wrap gap-2 text-[8px] font-bold text-slate-500">
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 沙箱安全校验</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 隔离安全加密</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#3182ce]" /> 吞吐率对齐 100%</span>
                </div>
              </div>
            </section>

            {/* 3. 契约沙箱仿真模拟器 */}
            <section className="bg-slate-50/50 rounded-xl p-4.5 border border-slate-150 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-800 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-[#38a169]" />
                  <span>契约加工沙箱仿真模拟 (Sandbox Simulator)</span>
                </span>
                {simState === "running" ? (
                  <span className="text-[8px] font-black text-blue-500 animate-pulse bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    仿真中...
                  </span>
                ) : simState === "success" ? (
                  <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    通过
                  </span>
                ) : (
                  <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                    空闲
                  </span>
                )}
              </div>

              {simState === "idle" ? (
                <div className="bg-white border border-slate-150 p-3.5 rounded-lg text-center space-y-2.5">
                  <p className="text-[9.5px] text-slate-500 font-semibold leading-normal">
                    想查看该组件如何进行数据比对并转换输出吗？一键启动数据沙箱测试，预览运行日志流。
                  </p>
                  <button
                    onClick={runSimulator}
                    className="h-7.5 px-3.5 bg-slate-800 hover:bg-slate-900 text-white text-[9.5px] font-black rounded-lg shadow-sm transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                  >
                    <span>启动数据沙盒测试</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 animate-in fade-in duration-250">
                  <div className="bg-slate-950 text-slate-400 rounded-lg p-3 border border-slate-800 shadow-inner font-mono text-[9px] leading-relaxed space-y-1.5 max-h-[110px] overflow-y-auto scrollbar-thin">
                    {simLogs.map((log, index) => (
                      <div key={index} className="transition-all">
                        {log}
                      </div>
                    ))}
                    {simState === "running" && (
                      <div className="flex items-center gap-1 text-slate-500">
                        <span>[系统运行] 📡 运算中</span>
                        <span className="w-1 h-3 bg-slate-400 animate-pulse"></span>
                      </div>
                    )}
                  </div>

                  {simState === "success" && (
                    <div className="bg-emerald-50/10 border border-emerald-200/50 rounded-lg p-3 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                      <div className="text-[8.5px] font-black text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>仿真调试成果物验证完毕 (Checksum Validated)</span>
                      </div>
                      <div className="bg-slate-900/5 rounded p-2 text-[9.5px] font-bold text-slate-600 font-mono leading-relaxed border border-emerald-100/30">
                        {comp.previewData.outputMock}
                      </div>
                      <div className="flex items-center justify-between text-[8px] text-slate-400 font-bold pt-0.5">
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
            </section>

            {/* 4. 可视化 ROI 商业提效滑轨 - 轻量化 */}
            <section className="bg-gradient-to-r from-emerald-50/40 via-blue-50/10 to-teal-50/30 border border-emerald-100/60 rounded-xl p-3.5 flex items-center gap-3 justify-between">
              <div className="space-y-0.5 min-w-0 flex-1">
                <span className="text-[10px] font-black text-emerald-700 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>商业级投入产出比 (ROI Efficiency)</span>
                </span>
                <span className="text-[9.5px] text-slate-500 font-semibold block truncate leading-relaxed">
                  {comp.previewData.roiText}
                </span>
              </div>
              <div className="bg-white rounded-lg border border-slate-200 p-2 shadow-inner shrink-0 w-[100px] text-center space-y-0.5">
                <span className="text-[7.5px] font-black text-slate-400 block tracking-wider uppercase">提效比例</span>
                <span className="text-xs font-black text-emerald-600 block leading-none font-mono">
                  {comp.category === "BID_PREP" || comp.category === "REQ_DESIGN" ? "85% +" : "3.5 倍"}
                </span>
              </div>
            </section>

          </div>

          {/* 右侧空间分发与部署中枢 (占 5 列) - 精致渐变分栏底色 */}
          <div className="lg:col-span-5 h-full overflow-y-auto p-5 bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] scrollbar-thin flex flex-col justify-between border-l border-slate-150">
            <div className="space-y-4">
              
              {/* 🚀 智能路由网关 (ZhiGe Dynamic Routing Hub) - 精致仪表卡片 */}
              <section className="bg-white border border-[#3182ce]/15 rounded-xl p-4 shadow-[0_4px_12px_rgba(49,130,206,0.03)] relative overflow-hidden flex flex-col gap-3">
                <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#3182ce]/5 to-indigo-500/2 rounded-full blur-lg pointer-events-none"></div>
                <div className="space-y-1.5 min-w-0 relative z-10 flex-1">
                  <span className="text-[8.5px] font-black text-[#3182ce] uppercase tracking-wider block">
                    准备就绪的运行目标 workspace
                  </span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-xs font-black text-slate-800 truncate">
                      {selectedWorkspaceName}
                    </span>
                    {selectedWorkspace?.type === "PERSONAL" ? (
                      <span className="text-[7.5px] px-1.5 py-0.2 bg-blue-50 text-[#3182ce] border border-blue-100 rounded font-semibold scale-90">个人</span>
                    ) : selectedWorkspace ? (
                      <span className="text-[7.5px] px-1.5 py-0.2 bg-amber-50 text-amber-600 border border-amber-100 rounded font-semibold scale-90">企业</span>
                    ) : null}
                  </div>
                  
                  {/* 配额与状态对齐展示 */}
                  <div className="flex items-center gap-3 pt-1 text-[9.5px] font-semibold text-slate-500 border-t border-slate-50 mt-2">
                    <span className="flex items-center gap-1"><Coins className="w-3 h-3 text-[#3182ce]/70" /> 算力配额: <strong className="text-slate-700 font-bold font-mono">{(workspaceQuotas[selectedWorkspace?.id || ""] || 0).toLocaleString()}</strong></span>
                    <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-[#3182ce]/70" /> 状态: 
                      {isBound ? (
                        <strong className="text-emerald-600 font-black">已引进</strong>
                      ) : (
                        <strong className="text-slate-400 font-bold">待装配</strong>
                      )}
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={handleQuickUse}
                  className="w-full h-8.5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-blue-700 text-white text-[10px] font-black rounded shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0 z-10"
                >
                  <Layers className="w-3.5 h-3.5 fill-current text-white/20" />
                  <span>立即使用 (一键转场)</span>
                </button>
              </section>

              {/* 3. 工作空间分发列表 - 极致扁平化 */}
              <section className="space-y-2.5">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5 pl-0.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-500" />
                  工作空间分发绑定矩阵
                </h3>

                {!isLoggedIn ? (
                  <div className="bg-amber-50/20 border border-amber-150 rounded-xl p-5 text-center shadow-sm space-y-3">
                    <p className="text-[10.5px] text-amber-800 font-bold">您当前为游客模式，无法绑定空间。</p>
                    <p className="text-[9.5px] text-slate-400 font-medium">请登录系统以在开发沙盒中装配此效能资产。</p>
                    <button
                      onClick={handleQuickUse}
                      className="w-full h-8 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-[9.5px] font-black rounded shadow transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                      <span>立即登录使用</span>
                    </button>
                  </div>
                ) : loadingConfig ? (
                  <div className="bg-white rounded-xl p-6 border border-slate-200/50 shadow-sm flex flex-col items-center justify-center">
                    <div className="w-6 h-6 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-1.5" />
                    <p className="text-[9.5px] text-slate-400 font-bold">读取空间矩阵...</p>
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="bg-white rounded-xl p-5 border border-slate-200 border-dashed text-center">
                    <p className="text-[10.5px] text-slate-500 font-bold">暂无可用工作空间</p>
                    <p className="text-[9px] text-slate-400 mt-0.5">请前往控制台创建新开发空间</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {workspaces.map((ws) => {
                      const isWsBound = bindingStatusMap[ws.id] || false;
                      const isSelected = selectedWorkspaceId === ws.id;
                      const isProcessing = loadingStatuses[ws.id] || false;
                      const tokenBalance = workspaceQuotas[ws.id] || 0;

                      return (
                        <div
                          key={ws.id}
                          onClick={() => setSelectedWorkspaceId(ws.id)}
                          className={`border rounded-lg p-2.5 flex items-center justify-between transition-all cursor-pointer relative group ${
                            isSelected
                              ? "border-[#3182ce] ring-1 ring-[#3182ce]/15 bg-white shadow-[0_2px_8px_rgba(49,130,206,0.03)]"
                              : "border-slate-200/60 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* 同心圆激活指示器 - 更加扁平小巧 */}
                            <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${
                              isSelected ? "border-[#3182ce] bg-[#3182ce] text-white" : "border-slate-300"
                            }`}>
                              {isSelected && <div className="w-1 h-1 rounded-full bg-white"></div>}
                            </div>
                            
                            <div className="min-w-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-[11px] font-black text-slate-800 truncate">{ws.name}</span>
                                {ws.type === "PERSONAL" ? (
                                  <span className="text-[7px] px-1 py-0.1 bg-slate-100 text-slate-400 rounded flex-shrink-0 font-bold scale-90">个人</span>
                                ) : (
                                  <span className="text-[7px] px-1 py-0.1 bg-amber-50 text-amber-500 rounded border border-amber-100 flex-shrink-0 font-bold scale-90">企业</span>
                                )}
                                
                                {isWsBound ? (
                                  <span className="text-[7.5px] px-1 py-0.1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 flex-shrink-0 font-black scale-90 flex items-center gap-0.5">
                                    <span className="w-0.8 h-0.8 rounded-full bg-emerald-500"></span>
                                    已装配
                                  </span>
                                ) : (
                                  <span className="text-[7.5px] px-1 py-0.1 bg-slate-100 text-slate-400 rounded-full border border-slate-200/50 flex-shrink-0 font-bold scale-90">
                                    待引进
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] text-slate-400 font-bold mt-0.5 flex items-center gap-1.5">
                                <span>算力:</span>
                                <span className={tokenBalance < 100 ? "text-red-500 font-black font-mono" : "text-slate-500 font-black font-mono"}>
                                  {tokenBalance.toLocaleString()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 右侧微按钮操作区 */}
                          <div className="flex items-center">
                            {isProcessing ? (
                              <div className="w-4 h-4 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin"></div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedWorkspaceId(ws.id);
                                  setTimeout(handleQuickUse, 50);
                                }}
                                className={`h-6.5 px-2 text-[9px] font-black rounded transition-all flex items-center gap-0.5 cursor-pointer border ${
                                  isSelected
                                    ? "text-white bg-[#3182ce] border-[#3182ce] hover:bg-[#2b6cb0]"
                                    : "text-slate-600 bg-white hover:bg-slate-50 border-slate-200"
                                }`}
                              >
                                <span>{isWsBound ? "进入" : "装配并运行"}</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

            </div>
          </div>
          
        </div>

      </div>
    </div>
  );
}
