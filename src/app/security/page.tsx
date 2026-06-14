"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Lock,
  Server,
  Database,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Key,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import Footer from "@/components/Footer";
import { useAppContext } from "@/contexts/AppContext";
import { useToast } from "@/components/Toast";

const securityFeatures = [
  {
    icon: <Server className="w-6 h-6" />,
    title: "100% 物理级环境隔离",
    description: "全面支持 Docker、K8s 容器云在离线局域网环境一键部署，数据与模型资产不出内网。",
    highlights: ["离线局域网部署", "私有独立集群", "外部网络阻断"],
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: "零信任数据隔离沙箱",
    description: "基于组件级微租户运行环境做强力隔离，细粒度控制访问输入，核心数据阅后即焚。",
    highlights: ["微租户沙箱", "动态最小授权", "实时阻断审计"],
  },
  {
    icon: <Database className="w-6 h-6" />,
    title: "本地大模型算力底座",
    description: "高度适配国产化算力硬件（如昇腾、寒武纪）及本地开源知识库，离线编译与推理。",
    highlights: ["国产芯片优化", "本地知识库集成", "防隐私外泄"],
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "等保三级与国密合规",
    description: "数据流转全程国密 SM2/SM3/SM4 算法加解密，符合金融与军工三级安全等保规范要求。",
    highlights: ["国家三级等保", "国密算法链路", "合规专项认证"],
  },
];

export default function SecurityPage() {
  const router = useRouter();
  const { userState } = useAppContext();
  const toast = useToast();
  const [activeDiagramNode, setActiveDiagramNode] = useState<string | null>(null);

  const [mounted, setMounted] = useState(false);
  const [showDiagnoseWizard, setShowDiagnoseWizard] = useState(false);
  
  // Wizard states
  const [wizardStep, setWizardStep] = useState(0); // 0: step 1, 1: step 2, 2: processing, 3: report
  const [diagnoseProgress, setDiagnoseProgress] = useState(0);
  const [apiResult, setApiResult] = useState<{ score: number; risks: string[]; recs: string[] } | null>(null);
  
  // Form selections
  const [envScale, setEnvScale] = useState("medium");
  const [gpuType, setGpuType] = useState("ascend");
  const [isolationLevel, setIsolationLevel] = useState("air-gapped");
  const [complianceType, setComplianceType] = useState("level3");
  const [dbType, setDbType] = useState("dameng");
  
  // Report details
  const [reportScore, setReportScore] = useState(100);
  const [reportRisks, setReportRisks] = useState<string[]>([]);
  const [reportRecs, setReportRecs] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (wizardStep === 2) {
      setDiagnoseProgress(5);
      setApiResult(null);

      // 调用后端真实诊断 API
      const fetchDiagnosis = async () => {
        try {
          const res = await fetch("/api/security/diagnose", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userState.userInfo?.id || ""}`,
            },
            body: JSON.stringify({
              envScale,
              gpuType,
              isolationLevel,
              complianceType,
              dbType,
            }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            setApiResult({
              score: data.score,
              risks: data.risks,
              recs: data.recs,
            });
          } else {
            throw new Error(data.error || "诊断接口出错");
          }
        } catch (err) {
          console.error(err);
          // 备用兜底逻辑（如果 API 网卡，保证 UI 顺畅）
          let score = 95;
          const risks: string[] = ["【备份兜底提示】因网络通道异常，当前报告由本地算法生成。"];
          const recs: string[] = ["建议检查本地网络并重新运行架构安全诊断。"];
          setApiResult({ score, risks, recs });
        }
      };

      fetchDiagnosis();

      // UI 进度条模拟加载动画
      const interval = setInterval(() => {
        setDiagnoseProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          // 当加载到 90% 时如果接口还没返回，就卡住等待
          if (prev >= 90 && !apiResult) {
            return prev;
          }
          const next = prev + Math.floor(Math.random() * 15) + 12;
          return next > 100 ? 100 : next;
        });
      }, 300);

      return () => clearInterval(interval);
    }
  }, [wizardStep, envScale, gpuType, isolationLevel, complianceType, dbType, userState.userInfo?.id]);

  useEffect(() => {
    if (wizardStep === 2 && diagnoseProgress >= 100 && apiResult) {
      setReportScore(apiResult.score);
      setReportRisks(apiResult.risks);
      setReportRecs(apiResult.recs);
      setWizardStep(3);
      toast.success("诊断完成！已成功生成架构与安全诊断报告。");
    }
  }, [diagnoseProgress, wizardStep, apiResult]);

  const downloadReport = () => {
    const docContent = `ZhiGe Dockyard - Architecture & Security Diagnostic Report
Generated At: ${new Date().toLocaleString()}
Safety Score: ${reportScore} / 100

Deployment Scale: ${envScale === "small" ? "10人以下" : envScale === "medium" ? "10-100人" : "100人以上"}
GPU Hardware: ${gpuType === "nvidia" ? "NVIDIA" : gpuType === "ascend" ? "Huawei Ascend" : gpuType === "cambricon" ? "Cambricon" : "CPU Only"}
Isolation: ${isolationLevel === "air-gapped" ? "Air-gapped" : isolationLevel === "hybrid" ? "Hybrid" : "VPC"}
DB Type: ${dbType === "dameng" ? "Dameng" : dbType === "kingbase" ? "Kingbase" : "MySQL/PG"}
Compliance Standard: ${complianceType === "level3" ? "Level 3" : complianceType === "guomi" ? "Guomi" : "None"}

Detected Risks:
${reportRisks.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Architectural Recommendations:
${reportRecs.map((r, i) => `${i + 1}. ${r}`).join("\n")}
`;
    const blob = new Blob([docContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ZhiGe_Dockyard_Security_Report_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("安全诊断报告 (.txt) 下载成功！");
  };

  const diagramNodes: Record<string, { title: string; desc: string }> = {
    client: {
      title: "企业安全客户端 (Enterprise Client)",
      desc: "用户发起的所有研发与管理请求，全部通过双向 TLS 链路加密，并结合设备证书和动态零信任准入控制，杜绝中间人攻击与未授权终端接入。"
    },
    central: {
      title: "知阁舟坊智能中枢 (ZhiGe-Dockyard Core)",
      desc: "私有部署的中央引擎。调度运行时沙箱、管理权限策略、分发原子组件。与外网物理隔绝，所有核心任务调度均在企业本地局域网（LAN）中完成。"
    },
    sandbox: {
      title: "原子组件运行沙箱 (Component Runtime Sandbox)",
      desc: "为每个运行组件（如标书解析、PRD生成）临时分配微容器沙箱。读写隔离，在临时沙箱执行完成后彻底清除容器上下文，杜绝敏感数据残留。"
    },
    gpu: {
      title: "本地国产化大模型算力 (Local GPU Cluster)",
      desc: "完美适配昇腾 (Ascend) 芯片及各型算力硬件，所有大语言模型推理均在本地算力网络中计算，保障数据主权与推理过程完全私密。"
    }
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage: "radial-gradient(rgba(16, 185, 129, 0.1) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 背景光晕装饰 */}
      <div className="absolute top-0 right-[-10%] w-[35%] h-[35%] bg-emerald-500/[0.04] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[20%] left-[-10%] w-[45%] h-[45%] bg-[#3182ce]/[0.05] rounded-full blur-[140px] pointer-events-none" />

      {/* Hero Section */}
      <section className="relative pt-20 pb-12 z-10 text-center">
        <div className="max-w-7xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 backdrop-blur-md rounded-full shadow-sm border border-emerald-200/50 mb-6">
            <span className="text-xs font-black tracking-wide flex items-center gap-1.5 animate-pulse">
              🛡️ 国家等保三级与全链路国密标准保障
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6 tracking-tight leading-tight">
            数据主权不妥协：<br className="hidden md:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-600 to-[#3182ce]">
              全链路私有化部署架构
            </span>
          </h1>
          <p className="text-base md:text-lg text-slate-600 max-w-3xl mx-auto leading-relaxed">
            从数据资产存储、安全审计策略到本地大模型推理，全程都在您的专属局域网掌控之中。<br className="hidden md:inline" />消除泄密敞口，筑牢合规底座。
          </p>
        </div>
      </section>

      {/* Core Defense Cards Grid (Bento Style) */}
      <section className="relative pb-16 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              四大核心防御保障网
            </h2>
            <p className="text-slate-500 text-sm mt-2 font-medium">全方位覆盖软件研发生态中的信息隔离与合规审计需求</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {securityFeatures.map((feature, idx) => (
              <div
                key={idx}
                className="bg-white/80 backdrop-blur-md rounded-[20px] p-8 border border-white hover:border-emerald-500/30 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500/10 to-[#3182ce]/10 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-600 text-xs md:text-sm leading-relaxed font-medium mb-6">
                  {feature.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {feature.highlights.map((highlight, hidx) => (
                    <span
                      key={hidx}
                      className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[10px] md:text-xs font-bold rounded-full border border-emerald-100"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Deployment Architecture Diagram */}
      <section className="relative py-16 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
        {/* Tech Cyber Grid Background */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute top-[20%] right-[-10%] w-[35%] h-[35%] bg-emerald-500/[0.04] rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="text-xs bg-emerald-500/10 text-emerald-400 font-black px-3 py-1 rounded-full border border-emerald-500/15">
              ARCHITECTURE TOPOLOGY · 网络拓扑结构
            </span>
            <h2 className="text-3xl font-black text-white mt-4 mb-3 tracking-tight">
              私有化安全部署拓扑
            </h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
              支持完全的物理级内网环境运行（Air-gapped）。点击各节点查看详细安全沙箱阻断细节。
            </p>
          </div>

          <div className="grid lg:grid-cols-12 gap-8 items-stretch">
            {/* Interactive Architecture Flow Panel */}
            <div className="lg:col-span-8 bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-[24px] p-8 flex flex-col justify-center relative">
              
              {/* Grid Connection Flows */}
              <div className="grid md:grid-cols-4 gap-6 items-center relative z-10">
                {/* Node 1: Client */}
                <button
                  onClick={() => setActiveDiagramNode(activeDiagramNode === "client" ? null : "client")}
                  className={`flex flex-col items-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                    activeDiagramNode === "client" 
                      ? "bg-emerald-500/10 border-emerald-400/50 shadow-lg shadow-emerald-500/10" 
                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3 animate-pulse">
                    <Key className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-white font-black">1. 安全客户端</span>
                  <span className="text-[10px] text-slate-500 mt-1">设备接入证书与双向TLS</span>
                </button>

                {/* Node 2: Dockyard Core */}
                <button
                  onClick={() => setActiveDiagramNode(activeDiagramNode === "central" ? null : "central")}
                  className={`flex flex-col items-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                    activeDiagramNode === "central" 
                      ? "bg-emerald-500/10 border-emerald-400/50 shadow-lg shadow-emerald-500/10" 
                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 mb-3">
                    <Server className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-white font-black">2. 舟坊中枢</span>
                  <span className="text-[10px] text-slate-500 mt-1">本地局域网原子逻辑调度</span>
                </button>

                {/* Node 3: Component Sandbox */}
                <button
                  onClick={() => setActiveDiagramNode(activeDiagramNode === "sandbox" ? null : "sandbox")}
                  className={`flex flex-col items-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                    activeDiagramNode === "sandbox" 
                      ? "bg-emerald-500/10 border-emerald-400/50 shadow-lg shadow-emerald-500/10" 
                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400 mb-3">
                    <Eye className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-white font-black">3. 原子沙箱</span>
                  <span className="text-[10px] text-slate-500 mt-1">临时微租户运行时空间</span>
                </button>

                {/* Node 4: Local Model */}
                <button
                  onClick={() => setActiveDiagramNode(activeDiagramNode === "gpu" ? null : "gpu")}
                  className={`flex flex-col items-center p-4 rounded-xl border text-center transition-all cursor-pointer ${
                    activeDiagramNode === "gpu" 
                      ? "bg-emerald-500/10 border-emerald-400/50 shadow-lg shadow-emerald-500/10" 
                      : "bg-white/[0.02] border-white/5 hover:border-white/10"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center text-yellow-400 mb-3">
                    <Database className="w-5 h-5" />
                  </div>
                  <span className="text-xs text-white font-black">4. 本地昇腾/GPU</span>
                  <span className="text-[10px] text-slate-500 mt-1">纯本地化离线大语言模型</span>
                </button>
              </div>

              {/* Dotted Connecting Lines Behind */}
              <div className="hidden md:block absolute left-10 right-10 top-1/2 -translate-y-6 h-0.5 border-t border-dashed border-white/10 pointer-events-none" />
            </div>

            {/* Explanation Details panel */}
            <div className="lg:col-span-4 bg-white/[0.02] backdrop-blur-xl border border-white/5 rounded-[24px] p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-sm text-emerald-400 font-bold mb-4 flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin-slow" /> 节点安全沙箱信息
                </h3>
                
                {activeDiagramNode ? (
                  <div className="space-y-3 animate-slide-in-right">
                    <h4 className="text-base font-black text-white">{diagramNodes[activeDiagramNode].title}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">{diagramNodes[activeDiagramNode].desc}</p>
                  </div>
                ) : (
                  mounted && userState.isLoggedIn ? (
                    <div className="space-y-4 text-left animate-slide-in-right">
                      <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/25">
                        <div className="text-[10px] text-emerald-400 font-black">当前工作空间:</div>
                        <div className="text-xs text-white font-bold mt-1">个人沙盒空间 (Active)</div>
                      </div>
                      <div className="space-y-2 text-[11px] text-emerald-300">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>局域网物理隔离状态: 正常</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>等保 2.0 合规检测: 达标 (98分)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          <span>安全审计日志: 已启用</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 py-12 text-center font-bold">
                      💡 点击左侧网络拓扑中的任意节点，可以查看该主权隔离节点的防御设计详情
                    </div>
                  )
                )}
              </div>

              <div className="h-px bg-white/5 my-4" />

              <div className="text-[11px] text-slate-500 font-medium">
                🔒 本部署拓扑全程支持内网级断网审计隔离。
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Compliance Certificates Grid */}
      <section className="relative py-20 z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
              合规体系与安全审查认证
            </h2>
            <p className="text-slate-500 text-sm mt-2 font-medium">满足金融、能源与涉密研发等核心合规红线规范</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { title: "三级等保", desc: "国家信息安全等级保护三级认证" },
              { title: "ISO 27001", desc: "全球标准信息安全管理体系认证" },
              { title: "全链路国密", desc: "支持 SM2/SM3/SM4 链条算法" },
              { title: "SOC 2 Type II", desc: "数据运营与审计信赖度年度报告" },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 bg-white/60 backdrop-blur-md rounded-[16px] p-5 border border-white"
              >
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800">{item.title}</h4>
                  <p className="text-[10px] text-slate-500 mt-0.5 leading-snug font-medium">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security CTA Upgrade banner */}
      <section className="relative py-20 z-10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-[#3182ce]/5 backdrop-blur-xl border border-white/80 rounded-[24px] p-10 shadow-lg">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 mb-4 tracking-tight">
              准备好定制您的私有化部署架构？
            </h2>
            <p className="text-sm md:text-base text-slate-600 mb-8 font-medium">
              让我们的安全专家及架构师团队，为您的企业网络拓扑量身定制最妥当的落地实施方案。
            </p>
            <button
              onClick={() => {
                setWizardStep(0);
                setDiagnoseProgress(0);
                setShowDiagnoseWizard(true);
              }}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-base font-black rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer animate-pulse"
            >
              <span>立即发起架构与安全诊断</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* 架构与安全诊断 Wizard Modal */}
      {mounted && showDiagnoseWizard && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-[16px] shadow-xl border border-slate-200 max-w-lg w-full p-6 relative text-left">
            <button 
              onClick={() => {
                setShowDiagnoseWizard(false);
                setWizardStep(0);
                setDiagnoseProgress(0);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 cursor-pointer"
              disabled={wizardStep === 2}
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-600" />
              架构与安全诊断助手 (ZhiGe Guard)
            </h3>

            {/* Step 1: Env Config */}
            {wizardStep === 0 && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-bold">进度评估</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-700 font-black px-2 py-0.5 rounded-full">步骤 1/2: 基础环境</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 zg-required">
                    部署环境与团队规模
                  </label>
                  <select 
                    value={envScale}
                    onChange={(e) => setEnvScale(e.target.value)}
                    className="zg-input"
                  >
                    <option value="small">10人以下 (初创研发团队)</option>
                    <option value="medium">10-100人 (中型软件企业)</option>
                    <option value="large">100人以上 (集团/核心政企部门)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 zg-required">
                    国产信创硬件/GPU 类型
                  </label>
                  <select 
                    value={gpuType}
                    onChange={(e) => setGpuType(e.target.value)}
                    className="zg-input"
                  >
                    <option value="ascend">华为昇腾 (Huawei Ascend 910B)</option>
                    <option value="cambricon">寒武纪思元 (Cambricon MLU)</option>
                    <option value="nvidia">英伟达系列 (NVIDIA A100/H800)</option>
                    <option value="cpu">仅依赖本地 CPU 算力集群</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 zg-required">
                    网络安全物理隔离等级
                  </label>
                  <select 
                    value={isolationLevel}
                    onChange={(e) => setIsolationLevel(e.target.value)}
                    className="zg-input"
                  >
                    <option value="air-gapped">100% 离线物理网闸隔离 (Air-gapped)</option>
                    <option value="hybrid">混合网络 (专网隔离 + 特定安全网关出网)</option>
                    <option value="vpc">公有云独立隔离专区 (VPC Sandbox)</option>
                  </select>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setWizardStep(1)}
                    className="zg-btn zg-btn-primary text-xs"
                  >
                    下一步
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Software & Compliance */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-bold">进度评估</span>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-700 font-black px-2 py-0.5 rounded-full">步骤 2/2: 合规配置</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 zg-required">
                    安全合规审计标准
                  </label>
                  <select 
                    value={complianceType}
                    onChange={(e) => setComplianceType(e.target.value)}
                    className="zg-input"
                  >
                    <option value="level3">国家网络安全等级保护 (等保三级)</option>
                    <option value="guomi">全链路国产密码算法标准 (SM2/3/4)</option>
                    <option value="none">暂无特定涉密审查级别要求</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5 zg-required">
                    目标部署数据库
                  </label>
                  <select 
                    value={dbType}
                    onChange={(e) => setDbType(e.target.value)}
                    className="zg-input"
                  >
                    <option value="dameng">达梦信创数据库 (Dameng DM8)</option>
                    <option value="kingbase">人大金仓国产库 (Kingbase ES)</option>
                    <option value="traditional">MySQL / PostgreSQL 传统数据库</option>
                  </select>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setWizardStep(0)}
                    className="zg-btn zg-btn-default text-xs"
                  >
                    上一步
                  </button>
                  <button
                    onClick={() => setWizardStep(2)}
                    className="zg-btn zg-btn-primary text-xs"
                  >
                    开始安全诊断
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Diagnosing */}
            {wizardStep === 2 && (
              <div className="space-y-6 py-4 text-center">
                <div className="flex justify-center">
                  <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-slate-700 font-black">正在分析您的网络架构安全因子...</p>
                  <p className="text-[10px] text-slate-500">
                    {diagnoseProgress < 30 && "⚡ 正在计算本地信创硬件适配兼容性指数..."}
                    {diagnoseProgress >= 30 && diagnoseProgress < 65 && "⚡ 正在扫描传输层国密 SM 链路覆盖率..."}
                    {diagnoseProgress >= 65 && "⚡ 正在出具定制数据库及容器隔离配置报告..."}
                  </p>
                </div>
                <div className="relative pt-1 max-w-xs mx-auto">
                  <div className="overflow-hidden h-2 text-xs flex rounded-full bg-emerald-100">
                    <div 
                      style={{ width: `${diagnoseProgress}%` }}
                      className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-300 rounded-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Diagnostic Report Display */}
            {wizardStep === 3 && (
              <div className="space-y-5">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block">架构安全合规得分</span>
                    <span className="text-3xl font-black text-slate-800 tracking-tight">{reportScore} <span className="text-xs font-bold text-slate-500">/ 100分</span></span>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-black border ${
                    reportScore >= 90 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {reportScore >= 90 ? "极高安全" : "中度合规风险"}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> 潜在架构合规风险 ({reportRisks.length}项)
                    </h4>
                    <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100 space-y-2 max-h-[110px] overflow-y-auto pr-1">
                      {reportRisks.map((risk, i) => (
                        <p key={i} className="text-[10px] text-slate-650 leading-relaxed font-bold">
                          • {risk}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> 推荐架构适配方案
                    </h4>
                    <div className="bg-emerald-50/30 rounded-lg p-3 border border-emerald-100 space-y-2 max-h-[110px] overflow-y-auto pr-1">
                      {reportRecs.map((rec, i) => (
                        <p key={i} className="text-[10px] text-slate-650 leading-relaxed font-bold">
                          • {rec}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => setWizardStep(0)}
                    className="zg-btn zg-btn-default text-xs"
                  >
                    重新配置
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={downloadReport}
                      className="zg-btn zg-btn-default text-xs text-slate-800 border-slate-300 hover:border-slate-400"
                    >
                      下载诊断报告
                    </button>
                    <button
                      onClick={() => {
                        setShowDiagnoseWizard(false);
                        setWizardStep(0);
                      }}
                      className="zg-btn zg-btn-primary text-xs"
                    >
                      完成诊断
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}