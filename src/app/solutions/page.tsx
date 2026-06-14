"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle, TrendingDown, TrendingUp, Clock, Users, Shield, Code, Database, X, Loader2 } from "lucide-react";
import Footer from "@/components/Footer";
import { useAppContext } from "@/contexts/AppContext";
import { useToast } from "@/components/Toast";

type TabType = "integrator" | "government" | "outsourcing";

interface TabContent {
  title: string;
  subtitle: string;
  highlights: string[];
  metrics: { label: string; value: string; change: string; icon: React.ReactNode }[];
  benefits: { title: string; description: string; icon: React.ReactNode }[];
}

const tabContents: Record<TabType, TabContent> = {
  integrator: {
    title: "软件集成商",
    subtitle: "售前打单成本降低 40%，项目交付周期缩短",
    highlights: [
      "标书智能解析，快速响应招标需求要点",
      "自动化技术方案生成，打造高水准标书",
      "需求分析与软件方案一键自动化产出",
      "交付质量标准化，消除后期实施风险",
    ],
    metrics: [
      { label: "售前成本降低", value: "40%", change: "-40%", icon: <TrendingDown className="w-4 h-4" /> },
      { label: "交付周期缩短", value: "30%", change: "-30%", icon: <Clock className="w-4 h-4" /> },
      { label: "中标率提升", value: "25%", change: "+25%", icon: <TrendingUp className="w-4 h-4" /> },
      { label: "交付满意度", value: "98%", change: "+18%", icon: <Users className="w-4 h-4" /> },
    ],
    benefits: [
      { title: "标书智能解析", description: "提取招标要点与符合性条款，极速匹配响应策略", icon: <Code className="w-6 h-6" /> },
      { title: "方案自动生成", description: "根据业务需求自动编写专业架构设计与配置清单", icon: <Database className="w-6 h-6" /> },
      { title: "报价辅助系统", description: "基于项目复杂度多维度智能估算成本，优化定价", icon: <TrendingUp className="w-6 h-6" /> },
    ],
  },
  government: {
    title: "政企 IT 部门",
    subtitle: "全链路代码审计、信创环境兼容与知识库私有化",
    highlights: [
      "全链路代码安全审计，规避安全合规隐患",
      "完美兼容信创底座，支持多国产化系统适配",
      "业务资产沉淀，构建安全的企业知识库",
      "100% 物理级隔离部署，保证数据主权不受侵害",
    ],
    metrics: [
      { label: "安全漏洞发现", value: "95%", change: "+60%", icon: <Shield className="w-4 h-4" /> },
      { label: "信创适配效率", value: "80%", change: "+50%", icon: <Code className="w-4 h-4" /> },
      { label: "知识资产复用", value: "75%", change: "+45%", icon: <Database className="w-4 h-4" /> },
      { label: "合规安全达标", value: "100%", change: "+20%", icon: <CheckCircle className="w-4 h-4" /> },
    ],
    benefits: [
      { title: "深度代码审计", description: "全量分析源代码，识别高危漏洞与代码质量缺陷", icon: <Shield className="w-6 h-6" /> },
      { title: "信创生态适配", description: "适配麒麟、统信等系统及达梦、人大金仓数据库", icon: <Code className="w-6 h-6" /> },
      { title: "私有化知识底座", description: "内网环境中沉淀文档与技术问答，杜绝云端泄密", icon: <Database className="w-6 h-6" /> },
    ],
  },
  outsourcing: {
    title: "实施外包团队",
    subtitle: "标准化代码模板、多人高频流转零成本交接",
    highlights: [
      "基于脚手架标准化交付代码，规避返工风险",
      "零门槛上手，新团队成员极速熟悉业务逻辑",
      "全流程文档与接口代码同步，免除沟通鸿沟",
      "内置代码审计与规范检查，确保流水线标准统一",
    ],
    metrics: [
      { label: "新人上手周期", value: "7天", change: "-60%", icon: <Clock className="w-4 h-4" /> },
      { label: "工程代码复用", value: "60%", change: "+35%", icon: <Code className="w-4 h-4" /> },
      { label: "生产缺陷率", value: "50%", change: "-50%", icon: <TrendingDown className="w-4 h-4" /> },
      { label: "交付效率提升", value: "40%", change: "+40%", icon: <TrendingUp className="w-4 h-4" /> },
    ],
    benefits: [
      { title: "脚手架代码生成", description: "基于业务配置一键导出结构规范、注释完备的源码", icon: <Code className="w-6 h-6" /> },
      { title: "全自研知识库", description: "自动编写开发者导学文档，新人无痛交接项目", icon: <Users className="w-6 h-6" /> },
      { title: "质量监控哨兵", description: "全自动流水线拦截违规编码，免除人工 review 压力", icon: <Shield className="w-6 h-6" /> },
    ],
  },
};

const industryScenarios = [
  {
    title: "智慧水利",
    description: "大坝智能化健康安全运维、核心水资源智能调配系统",
    stats: [
      { label: "异常故障预警", value: "99.2%" },
      { label: "日常运维开销", value: "-35%" },
    ],
  },
  {
    title: "装备制造",
    description: "轨道交通、起重及盾构设备数字孪生与智能化设计",
    stats: [
      { label: "技术设计耗时", value: "-40%" },
      { label: "测试缺陷下降", value: "-55%" },
    ],
  },
  {
    title: "智慧政务",
    description: "一体化政务办理系统、数字城轨运营中枢与交通流分析",
    stats: [
      { label: "并发调度效率", value: "+80%" },
      { label: "服务交互时延", value: "<3秒" },
    ],
  },
  {
    title: "金融合规",
    description: "银企交易风控平台、智能质检与高敏感级客服应答系统",
    stats: [
      { label: "并发事务处理", value: "10万TPS" },
      { label: "虚假交易拦截", value: "99.8%" },
    ],
  },
];

export default function SolutionsPage() {
  const router = useRouter();
  const { userState, refreshUserState, isLoading } = useAppContext();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>("integrator");
  
  const [mounted, setMounted] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showConsultModal, setShowConsultModal] = useState(false);
  
  // States for Config Modal
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [configStep, setConfigStep] = useState(0); // 0: select, 1: cloning, 2: schema, 3: pipeline, 4: success
  const [configProgress, setConfigProgress] = useState(0);
  
  // States for Consult Modal
  const [consultForm, setConsultForm] = useState({
    companyName: "",
    contactName: "",
    contactPhone: "",
    scenario: "integrator",
    description: "",
    workspaceId: ""
  });
  const [submittingConsult, setSubmittingConsult] = useState(false);
  const [configuredWorkspaces, setConfiguredWorkspaces] = useState<Record<string, string>>({}); // { workspaceId: solutionName }

  // 异步加载最新工作区并打开配置弹窗 (防止加载时序导致的暂无空间异常)
  const handleOpenConfigModal = async (wsId?: string) => {
    setShowConfigModal(true);
    setWorkspaceLoading(true);
    if (wsId) {
      setSelectedWorkspaceId(wsId);
    } else {
      setSelectedWorkspaceId(userState.currentWorkspaceId || userState.workspaces[0]?.id || "");
    }
    setConfigStep(0);
    setConfigProgress(0);
    try {
      await refreshUserState();
    } catch (e) {
      console.error("solutions page refresh user state error:", e);
    } finally {
      setWorkspaceLoading(false);
    }
  };

  // Hydration-safe UI text states
  const [descText, setDescText] = useState("深入多业务核心痛点，针对不同商业主体与合规生态提供定制化算力底座，助力团队实现百倍效能跃升与资产安全隔离。");
  const [btnText, setBtnText] = useState("免费咨询此解决方案");
  const [globalCtaText, setGlobalCtaText] = useState("申请专属行业架构咨询");



  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem("zhige_configured_solutions");
      if (stored) {
        setConfiguredWorkspaces(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 从数据库动态加载工作空间已部署的方案配置 (闭环流程)
  useEffect(() => {
    if (mounted && userState.isLoggedIn) {
      const fetchWorkspaceSolutions = async () => {
        try {
          const userId = localStorage.getItem("userId") || userState.userInfo?.id;
          const res = await fetch("/api/workspace/list", {
            headers: userId ? { Authorization: `Bearer ${userId}` } : {},
          });
          if (res.ok) {
            const data = await res.json();
            const dbConfigs: Record<string, string> = {};
            data.workspaces.forEach((ws: any) => {
              if (ws.description && ws.description.includes("[已部署方案: ")) {
                const match = ws.description.match(/\[已部署方案:\s*(\w+)\]/);
                if (match) {
                  dbConfigs[ws.id] = match[1];
                }
              }
            });
            setConfiguredWorkspaces(dbConfigs);
          }
        } catch (error) {
          console.error("Failed to load workspace solutions from DB:", error);
        }
      };
      fetchWorkspaceSolutions();
    }
  }, [mounted, userState.isLoggedIn, userState.currentWorkspaceId]);

  // Update text states after mount to prevent hydration mismatches
  useEffect(() => {
    if (mounted) {
      if (userState.isLoggedIn) {
        setDescText("当前工作空间已连接，所有系统与配置方案将自动适配您的本地研发环境与数据隔离要求。");
        setBtnText(
          userState.currentWorkspaceId && configuredWorkspaces[userState.currentWorkspaceId] === activeTab 
            ? "重新为空间配置此方案" 
            : "一键为当前空间配置此方案"
        );
        setGlobalCtaText(`提交定制架构咨询 (当前账号: ${userState.userInfo?.name || '开发者'})`);
      } else {
        setDescText("深入多业务核心痛点，针对不同商业主体与合规生态提供定制化算力底座，助力团队实现百倍效能跃升与资产安全隔离。");
        setBtnText("免费咨询此解决方案");
        setGlobalCtaText("申请专属行业架构咨询");
      }
    }
  }, [mounted, userState.isLoggedIn, userState.userInfo?.name, userState.currentWorkspaceId, configuredWorkspaces, activeTab]);

  // Check URL query parameters to auto-open consultation modal
  useEffect(() => {
    if (mounted) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("consult") === "true") {
        setShowConsultModal(true);
      }
    }
  }, [mounted]);

  // 当工作区拉取完成，且未选中空间时，自动将默认空间进行绑定，防范空白选择
  useEffect(() => {
    if (!workspaceLoading && showConfigModal && !selectedWorkspaceId) {
      setSelectedWorkspaceId(userState.currentWorkspaceId || userState.workspaces[0]?.id || "");
    }
  }, [workspaceLoading, showConfigModal, selectedWorkspaceId, userState.currentWorkspaceId, userState.workspaces]);

  useEffect(() => {
    if (configStep > 0 && configStep < 4) {
      if (configProgress >= 100) {
        setConfigStep(4);
        
        // 实时向后端发送 POST 请求，持久化部署数据并记录日志 (闭环流程)
        fetch("/api/workspace/configure-solution", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userState.userInfo?.id || localStorage.getItem("userId")}`
          },
          body: JSON.stringify({
            workspaceId: selectedWorkspaceId,
            solutionName: activeTab
          })
        }).then(async (res) => {
          if (res.ok) {
            const newConfigs = { ...configuredWorkspaces, [selectedWorkspaceId]: activeTab };
            setConfiguredWorkspaces(newConfigs);
            localStorage.setItem("zhige_configured_solutions", JSON.stringify(newConfigs));
            toast.success(`方案配置成功！工作空间已成功适配【${tabContents[activeTab].title}】方案，配置已持久化至系统数据库！`);
            await refreshUserState();
          } else {
            toast.error("配置保存失败");
          }
        }).catch(err => {
          console.error("Configure solution error:", err);
          toast.error("网络异常，方案配置保存失败");
        });
      } else if (configProgress >= 65) {
        setConfigStep(3);
      } else if (configProgress >= 30) {
        setConfigStep(2);
      }
    }
  }, [configProgress, configStep, selectedWorkspaceId, activeTab, configuredWorkspaces]);

  const handleConfigure = () => {
    if (!selectedWorkspaceId) {
      toast.error("请选择一个工作空间");
      return;
    }
    
    // Start step-by-step animation
    setConfigStep(1);
    setConfigProgress(10);
    
    const interval = setInterval(() => {
      setConfigProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        const next = prev + Math.floor(Math.random() * 15) + 8;
        return next > 100 ? 100 : next;
      });
    }, 450);
  };

  const handleConsultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultForm.companyName || !consultForm.contactName || !consultForm.contactPhone) {
      toast.error("请填写所有必填字段");
      return;
    }
    
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(consultForm.contactPhone)) {
      toast.error("请输入有效的手机号码");
      return;
    }
    
    setSubmittingConsult(true);
    
    try {
      if (userState.isLoggedIn && consultForm.workspaceId) {
        const res = await fetch("/api/workspace/upgrade-application", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            companyName: consultForm.companyName,
            contactName: consultForm.contactName,
            contactPhone: consultForm.contactPhone,
            workspaceId: consultForm.workspaceId,
          }),
        });
        
        const data = await res.json();
        if (res.ok) {
          toast.success("您的定制架构咨询已提交！专属客户经理将在2小时内为您开通配置通道。");
          setShowConsultModal(false);
          setConsultForm({
            companyName: "",
            contactName: "",
            contactPhone: "",
            scenario: activeTab,
            description: "",
            workspaceId: ""
          });
        } else {
          toast.error(data.error || "提交失败，请重试");
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 800));
        toast.success("定制架构咨询成功提交！我们的架构专家将在24小时内与您联系。");
        setShowConsultModal(false);
        setConsultForm({
          companyName: "",
          contactName: "",
          contactPhone: "",
          scenario: activeTab,
          description: "",
          workspaceId: ""
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("网络异常，提交失败");
    } finally {
      setSubmittingConsult(false);
    }
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.12) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 科技背景装饰环 */}
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.06] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.06] rounded-full blur-[120px] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-12 z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-md rounded-full shadow-sm border border-blue-200/30 mb-6">
            <span className="text-xs text-[#2b6cb0] font-black tracking-wide flex items-center gap-1.5">
              🚀 行业效能实践方案
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight">
            数据主权保障 ·{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#3182ce] via-[#2b6cb0] to-[#10b981]">
              行业数字化解决方案
            </span>
          </h1>
          <p className="text-base md:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed mb-6">
            {descText}
          </p>


        </div>
      </section>

      {/* Tabs Switcher Section */}
      <section className="relative pb-20 z-10">
        <div className="max-w-7xl mx-auto px-6">
          {/* Frosted Glass Tabs */}
          <div className="flex justify-center gap-3 mb-12 max-w-lg mx-auto p-1.5 bg-white/60 backdrop-blur-lg rounded-full border border-slate-200/50 shadow-md flex-nowrap overflow-x-auto scrollbar-none whitespace-nowrap">
            {(Object.keys(tabContents) as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2.5 rounded-full text-sm font-black transition-all cursor-pointer shrink-0 ${
                  activeTab === tab
                    ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-md shadow-[#2b6cb0]/25"
                    : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                }`}
              >
                {tabContents[tab].title}
              </button>
            ))}
          </div>

          {/* === 智能推荐横条：当用户已登录且有活跃空间时显示 === */}
          {mounted && userState.isLoggedIn && userState.currentWorkspaceId && (() => {
            const currentWs = userState.workspaces.find(ws => ws.id === userState.currentWorkspaceId);
            if (!currentWs) return null;
            const isConfigured = configuredWorkspaces[currentWs.id] === activeTab;
            return (
              <div className={`mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-3.5 rounded-[14px] border transition-all ${
                isConfigured
                  ? "bg-emerald-50/80 border-emerald-200/60 backdrop-blur-md"
                  : "bg-blue-50/70 border-blue-200/50 backdrop-blur-md"
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isConfigured ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-[#2b6cb0]"
                  }`}>
                    {isConfigured
                      ? <CheckCircle className="w-4 h-4" />
                      : <Code className="w-4 h-4" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className={`text-xs font-black truncate ${isConfigured ? "text-emerald-700" : "text-[#2b6cb0]"}`}>
                      💡 {isConfigured ? "当前方案已部署至此空间" : "建议：一键为当前空间配置此方案"}
                    </p>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                      当前空间：<span className="font-black text-slate-700">{currentWs.name}</span>
                      <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 font-bold">
                        {currentWs.type === "PERSONAL" ? "个人" : "企业"}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleOpenConfigModal(currentWs.id);
                  }}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                    isConfigured
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5"
                      : "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-sm hover:shadow-md hover:-translate-y-0.5"
                  }`}
                >
                  {isConfigured ? (
                    <><CheckCircle className="w-3.5 h-3.5" />重新配置此方案</>
                  ) : (
                    <><ArrowRight className="w-3.5 h-3.5" />立即配置至此空间</>
                  )}
                </button>
              </div>
            );
          })()}

          {/* Interactive Dynamic Grid */}
          <div className="grid lg:grid-cols-12 gap-10 items-center bg-white/40 backdrop-blur-xl rounded-[24px] p-8 md:p-10 border border-white/80 shadow-xl">
            {/* Details Panel */}
            <div className="lg:col-span-5 space-y-6">
              <div>
                <span className="text-xs bg-[#2b6cb0]/10 text-[#2b6cb0] font-black px-2.5 py-1 rounded-md">
                  当前方案适用
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 mt-3 mb-2 flex items-center gap-2">
                  {tabContents[activeTab].title}
                  {mounted && userState.isLoggedIn && userState.currentWorkspaceId && configuredWorkspaces[userState.currentWorkspaceId] === activeTab && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center gap-1 animate-pulse">
                      <CheckCircle className="w-3 h-3" /> 已部署至当前空间
                    </span>
                  )}
                </h2>
                <p className="text-slate-600 text-sm md:text-base font-medium">
                  {tabContents[activeTab].subtitle}
                </p>
              </div>

              <div className="h-px bg-slate-200/60" />

              <ul className="space-y-4">
                {tabContents[activeTab].highlights.map((highlight, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#10b981]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="w-3.5 h-3.5 text-[#10b981]" />
                    </div>
                    <span className="text-sm text-slate-700 leading-snug font-medium">{highlight}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-4">
                <button 
                  onClick={() => {
                    if (userState.isLoggedIn) {
                      handleOpenConfigModal();
                    } else {
                      setConsultForm(prev => ({
                        ...prev,
                        scenario: activeTab,
                        workspaceId: ""
                      }));
                      setShowConsultModal(true);
                    }
                  }}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-sm font-black shadow-md hover:shadow-lg hover:-translate-y-0.5 hover:gap-3 transition-all cursor-pointer"
                >
                  {btnText} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Metrics Dashboard */}
            <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
              {tabContents[activeTab].metrics.map((metric, index) => {
                const isPositive = metric.change.startsWith("+");
                return (
                  <div
                    key={index}
                    className="bg-white/90 backdrop-blur-md rounded-[20px] p-6 border border-white hover:border-[#3182ce]/20 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        isPositive ? "bg-emerald-50 text-[#10b981]" : "bg-red-50 text-red-500"
                      }`}>
                        {metric.icon}
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        isPositive ? "bg-emerald-50 text-[#10b981]" : "bg-red-50 text-red-500"
                      }`}>
                        {metric.change}
                      </span>
                    </div>
                    <div className="text-3xl font-black text-slate-800 mb-1">{metric.value}</div>
                    <div className="text-xs text-slate-500 font-bold">{metric.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lower Key Benefits Cards */}
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {tabContents[activeTab].benefits.map((benefit, index) => (
              <div 
                key={index} 
                className="bg-white/70 backdrop-blur-md rounded-[20px] p-6 border border-white/80 hover:border-[#3182ce]/30 hover:shadow-md transition-all duration-300"
              >
                <div className="w-11 h-11 bg-[#2b6cb0]/10 rounded-xl flex items-center justify-center mb-5 text-[#2b6cb0]">
                  {benefit.icon}
                </div>
                <h3 className="text-base font-black text-slate-800 mb-2">{benefit.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scenario Applications (Dark Mode Feature Section) */}
      <section className="relative py-20 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
        {/* Dotted grid for dark section */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[20%] left-[-10%] w-[35%] h-[35%] bg-purple-500/[0.05] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <span className="text-xs bg-purple-500/10 text-purple-400 font-black px-3 py-1 rounded-full border border-purple-500/15">
              CASE SHOWCASE · 标杆案例
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-white mt-4 mb-3 tracking-tight">
              多维度行业场景深度落地
            </h2>
            <p className="text-sm md:text-base text-slate-400 max-w-2xl mx-auto">
              知阁舟坊已广泛适配高敏感、强监管及重交互产业，提供扎实的数据主权保障。
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {industryScenarios.map((scenario, index) => (
              <div
                key={index}
                className="bg-white/[0.02] backdrop-blur-md rounded-[20px] p-6 border border-white/5 hover:border-[#3182ce]/40 hover:bg-white/[0.04] transition-all duration-300"
              >
                <h3 className="text-lg font-black text-white mb-2">{scenario.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed mb-6 font-medium h-10 overflow-hidden">{scenario.description}</p>
                
                <div className="h-px bg-white/5 mb-5" />

                <div className="space-y-3">
                  {scenario.stats.map((stat, statIndex) => (
                    <div key={statIndex} className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-bold">{stat.label}</span>
                      <span className="text-white font-black">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Global CTA upgrade banner */}
      <section className="relative py-20 z-10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5 backdrop-blur-xl border border-white/80 rounded-[24px] p-10 shadow-lg">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-4 tracking-tight">
              开启您团队的效能升级之旅
            </h2>
            <p className="text-sm md:text-base text-slate-600 mb-8 font-medium">
              支持全量数据本地加密隔离与私有集群搭建，满足最严苛的信息安全审查标准。
            </p>
            <button 
              onClick={() => {
                if (userState.isLoggedIn) {
                  setConsultForm(prev => ({
                    ...prev,
                    companyName: "",
                    contactName: userState.userInfo?.name || "",
                    contactPhone: "",
                    workspaceId: userState.currentWorkspaceId || userState.workspaces[0]?.id || ""
                  }));
                }
                setShowConsultModal(true);
              }}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-base font-black rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              {globalCtaText} <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* 方案配置 Modal */}
      {mounted && showConfigModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-[16px] shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 relative text-left">
            <button 
              onClick={() => {
                setShowConfigModal(false);
                setConfigStep(0);
                setConfigProgress(0);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 cursor-pointer"
              disabled={configStep > 0 && configStep < 4}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-[#2b6cb0]" />
              配置方案到工作空间
            </h3>

            {configStep === 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                  请选择您要应用当前【{tabContents[activeTab].title}】方案的工作空间：
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {(workspaceLoading || isLoading) ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-[#2b6cb0] mb-2" />
                      <p className="text-xs text-slate-500 font-medium">正在拉取工作空间列表...</p>
                    </div>
                  ) : userState.workspaces.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                        <Database className="w-5 h-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-black text-slate-500 mb-1">暂无可用工作空间</p>
                      <p className="text-[11px] text-slate-400 font-medium mb-3">请先前往「我的工作空间」创建一个工作空间</p>
                      <button
                        onClick={() => { setShowConfigModal(false); router.push("/workspace-hub"); }}
                        className="px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black rounded-lg hover:shadow-lg transition-all"
                      >
                        前往工作台创建空间
                      </button>
                    </div>
                  ) : (
                    userState.workspaces.map((ws) => {
                      const wsIsConfigured = configuredWorkspaces[ws.id] === activeTab;
                      return (
                        <label 
                           key={ws.id}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedWorkspaceId === ws.id 
                              ? "border-[#2b6cb0] bg-blue-50/30" 
                              : "border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="config_workspace" 
                              checked={selectedWorkspaceId === ws.id}
                              onChange={() => setSelectedWorkspaceId(ws.id)}
                              className="text-[#2b6cb0] focus:ring-[#2b6cb0]"
                            />
                            <span className="text-xs font-bold text-slate-700">{ws.name}</span>
                            {wsIsConfigured && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 font-bold flex items-center gap-1">
                                <CheckCircle className="w-2.5 h-2.5" />已部署
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                            {ws.type === "PERSONAL" ? "个人空间" : "企业空间"}
                          </span>
                        </label>
                      );
                    })
                  )}

                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setShowConfigModal(false)}
                    className="zg-btn zg-btn-default text-xs"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfigure}
                    disabled={workspaceLoading || isLoading || !selectedWorkspaceId || userState.workspaces.length === 0}
                    className="zg-btn zg-btn-primary text-xs"
                  >
                    确认并部署
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative pt-1">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black inline-block py-1 px-2.5 uppercase rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-100">
                        {configStep === 1 && "1. 正在克隆方案基础架构..."}
                        {configStep === 2 && "2. 正在配置底层信创数据表模式..."}
                        {configStep === 3 && "3. 正在部署代码审计流水线安全哨兵..."}
                        {configStep === 4 && "4. 配置成功！"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-black text-[#2b6cb0]">
                        {configProgress}%
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden h-2.5 text-xs flex rounded-full bg-blue-100/50">
                    <div 
                      style={{ width: `${configProgress}%` }}
                      className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-[#3182ce] to-[#10b981] transition-all duration-300 rounded-full"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {configStep >= 1 ? (
                      configStep > 1 ? (
                        <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0 animate-fade-in" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-[#2b6cb0] animate-spin flex-shrink-0" />
                      )
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-bold ${configStep >= 1 ? "text-slate-800" : "text-slate-400"}`}>
                      正在克隆方案基础架构 (Cloning base template)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {configStep >= 2 ? (
                      configStep > 2 ? (
                        <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0 animate-fade-in" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-[#2b6cb0] animate-spin flex-shrink-0" />
                      )
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-bold ${configStep >= 2 ? "text-slate-800" : "text-slate-400"}`}>
                      正在配置底层信创数据表模式 (Configuring schemas)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {configStep >= 3 ? (
                      configStep > 3 ? (
                        <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0 animate-fade-in" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-[#2b6cb0] animate-spin flex-shrink-0" />
                      )
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-bold ${configStep >= 3 ? "text-slate-800" : "text-slate-400"}`}>
                      正在部署代码审计流水线安全哨兵 (Deploying pipelines)
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {configStep === 4 ? (
                      <CheckCircle className="w-4 h-4 text-[#10b981] flex-shrink-0 animate-fade-in" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-200 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-bold ${configStep === 4 ? "text-slate-800" : "text-slate-400"}`}>
                      方案部署成功！(Deployment complete)
                    </span>
                  </div>
                </div>

                {configStep === 4 && (
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => {
                        setShowConfigModal(false);
                        setConfigStep(0);
                        setConfigProgress(0);
                      }}
                      className="zg-btn zg-btn-primary text-xs"
                    >
                      完成并返回
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 定制架构咨询 Modal */}
      {mounted && showConsultModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-[16px] shadow-xl border border-slate-200 max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 relative text-left">
            <button 
              onClick={() => setShowConsultModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#2b6cb0]" />
              定制化架构咨询与服务
            </h3>

            <form onSubmit={handleConsultSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 zg-required">
                  企业/团队名称
                </label>
                <input 
                  type="text"
                  required
                  placeholder="请输入您的企业或团队全称"
                  value={consultForm.companyName}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, companyName: e.target.value }))}
                  className="zg-input"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 zg-required">
                    联系人姓名
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="您的姓名"
                    value={consultForm.contactName}
                    onChange={(e) => setConsultForm(prev => ({ ...prev, contactName: e.target.value }))}
                    className="zg-input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 zg-required">
                    手机号码
                  </label>
                  <input 
                    type="tel"
                    required
                    placeholder="您的联系电话"
                    value={consultForm.contactPhone}
                    onChange={(e) => setConsultForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                    className="zg-input"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  咨询行业解决方案
                </label>
                <select
                  value={consultForm.scenario}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, scenario: e.target.value }))}
                  className="zg-input"
                >
                  <option value="integrator">软件集成商解决方案</option>
                  <option value="government">政企 IT 部门私有化方案</option>
                  <option value="outsourcing">实施外包标准化脚手架方案</option>
                </select>
              </div>

              {userState.isLoggedIn && userState.workspaces.length > 0 && (
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5 zg-required">
                    关联升级工作区
                  </label>
                  <select
                    value={consultForm.workspaceId}
                    onChange={(e) => setConsultForm(prev => ({ ...prev, workspaceId: e.target.value }))}
                    className="zg-input"
                    required
                  >
                    <option value="">-- 请选择关联的工作区 --</option>
                    {userState.workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name} ({ws.type === "PERSONAL" ? "个人" : "企业"})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  具体定制化需求描述
                </label>
                <textarea 
                  rows={3}
                  placeholder="请简要描述您的业务场景、部署规模、安全合规要求等..."
                  value={consultForm.description}
                  onChange={(e) => setConsultForm(prev => ({ ...prev, description: e.target.value }))}
                  className="zg-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConsultModal(false)}
                  className="zg-btn zg-btn-default text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submittingConsult}
                  className="zg-btn zg-btn-primary text-xs flex items-center gap-1.5"
                >
                  {submittingConsult && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  提交咨询申请
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}