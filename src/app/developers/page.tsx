"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, BookOpen, Download, ChevronRight, ChevronDown, FileCode, Zap, Key, Server, Loader2 } from "lucide-react";
import Footer from "@/components/Footer";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { useAppContext } from "@/contexts/AppContext";

const sidebarItems = [
  {
    title: "快速入门",
    children: [
      { title: "安装与配置", href: "#installation" },
      { title: "创建第一个工作流", href: "#first-workflow" },
      { title: "API 认证", href: "#authentication" },
    ],
  },
  {
    title: "API 参考",
    children: [
      { title: "标书解析接口", href: "#rfp-parse" },
      { title: "需求分析接口", href: "#requirement-analysis" },
      { title: "代码生成接口", href: "#code-generation" },
      { title: "文档生成接口", href: "#doc-generation" },
    ],
  },
  {
    title: "Webhook 接入",
    children: [
      { title: "事件订阅", href: "#event-subscription" },
      { title: "消息格式", href: "#message-format" },
      { title: "签名验证", href: "#signature-validation" },
    ],
  },
  {
    title: "自定义 Agent",
    children: [
      { title: "Agent 编排", href: "#agent-orchestration" },
      { title: "工具调用", href: "#tool-calling" },
      { title: "状态管理", href: "#state-management" },
    ],
  },
];

const tableOfContents = [
  { title: "密钥管理", href: "#api-key-manager" },
  { title: "接口概述", href: "#overview" },
  { title: "请求参数", href: "#parameters" },
  { title: "请求示例", href: "#example" },
  { title: "响应格式", href: "#response" },
  { title: "在线沙盒", href: "#api-sandbox" },
  { title: "部署向导", href: "#scaffolding-wizard" },
];

const apiExampleCode = `curl -X POST "https://api.zhige-dockyard.com/v1/rfp/parse" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "document_url": "https://example.com/rfp-document.pdf",
    "parse_options": {
      "extract_sections": ["requirements", "evaluation_criteria", "timeline"],
      "output_format": "markdown",
      "include_analysis": true
    }
  }'`;

const responseExample = `{
  "success": true,
  "data": {
    "document_id": "rfp-123456789",
    "parsed_content": {
      "requirements": [
        {
          "id": "R001",
          "text": "系统需支持 1000+ 并发用户",
          "category": "performance",
          "priority": "high"
        }
      ],
      "evaluation_criteria": [],
      "timeline": {}
    },
    "analysis_summary": {
      "total_requirements": 45,
      "high_priority": 12,
      "estimated_effort": "8-12 人月"
    }
  },
  "metadata": {
    "processing_time": 4.2,
    "token_usage": 1560
  }
}`;

export default function DevelopersPage() {
  const router = useRouter();
  const toast = useToast();
  const { userState } = useAppContext();
  const [expandedSections, setExpandedSections] = useState<string[]>(["快速入门", "API 参考"]);
  const [copied, setCopied] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  // States for API Key manager
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; key: string; createdAt: string }[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // States for API Sandbox
  const [sandboxEndpoint, setSandboxEndpoint] = useState("/v1/rfp/parse");
  const [sandboxKey, setSandboxKey] = useState("");
  const [sandboxBody, setSandboxBody] = useState("");
  const [sandboxOutput, setSandboxOutput] = useState("");
  const [sandboxStatus, setSandboxStatus] = useState<number | null>(null);
  const [testingSandbox, setTestingSandbox] = useState(false);

  // States for Scaffolding configurator
  const [scaffoldOs, setScaffoldOs] = useState("linux");
  const [scaffoldMode, setScaffoldMode] = useState("docker");
  const [scaffoldDb, setScaffoldDb] = useState("dameng");
  const [scaffoldHardware, setScaffoldHardware] = useState("ascend");

  useEffect(() => {
    const fetchApiKeys = async () => {
      if (!userState.isLoggedIn) {
        const defaultKey = {
          id: "key-demo",
          name: "默认本地密钥 (仅用于预览，请登录以创建真实密钥)",
          key: "zg_pk_live_d3f1a9b2c8e7f6a5b4c3d2e10",
          createdAt: new Date().toLocaleDateString()
        };
        setApiKeys([defaultKey]);
        setSandboxKey(defaultKey.key);
        return;
      }
      try {
        const res = await fetch("/api/user/api-keys");
        if (res.ok) {
          const data = await res.json();
          const mapped = data.apiKeys.map((k: any) => ({
            id: k.id,
            name: k.name,
            key: `${k.keyPrefix}************************`,
            createdAt: new Date(k.createdAt).toLocaleDateString()
          }));
          setApiKeys(mapped);
          if (mapped.length > 0) {
            // 设置沙盒的默认Key，如果已经生成过
            setSandboxKey(mapped[0].key);
          }
        }
      } catch (error) {
        console.error("Failed to fetch API keys from database:", error);
      }
    };
    fetchApiKeys();
  }, [userState.isLoggedIn]);

  const generateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("请输入密钥名称/别名");
      return;
    }
    
    if (!userState.isLoggedIn) {
      toast.info("您当前为游客模式。请先登录，以创建并保存真实密钥到您的账户。");
      router.push("/auth/login?redirect=/developers");
      return;
    }

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newKeyName.trim(),
          description: "在开发者中心创建"
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const newKey = {
            id: data.apiKey.id,
            name: data.apiKey.name,
            key: data.apiKey.key, // 仅在创建时能完整看到明文，后续数据库将进行不可逆哈希
            createdAt: new Date(data.apiKey.createdAt).toLocaleDateString()
          };
          setApiKeys((prev) => [newKey, ...prev.filter(k => k.id !== "key-demo")]);
          setSandboxKey(data.apiKey.key);
          setNewKeyName("");
          toast.success("🔑 API 密钥已成功创建并保存至数据库！此明文仅在创建时完整可见一次，请立即复制并妥善保管。");
        } else {
          toast.error(data.error || "生成密钥失败");
        }
      } else {
        toast.error("网络异常，生成失败");
      }
    } catch (error) {
      console.error("Generate API Key error:", error);
      toast.error("网络异常，生成失败");
    }
  };

  const copyKeyText = (key: string, id: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 1500);
    toast.success("密钥复制成功");
  };

  const deleteKey = async (id: string) => {
    if (!userState.isLoggedIn) {
      setApiKeys((prev) => prev.filter(k => k.id !== id));
      toast.success("密钥已删除");
      return;
    }

    try {
      const res = await fetch("/api/user/api-keys", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });

      if (res.ok) {
        setApiKeys((prev) => prev.filter(k => k.id !== id));
        toast.success("密钥已从数据库成功删除");
      } else {
        toast.error("删除密钥失败");
      }
    } catch (error) {
      console.error("Delete API key error:", error);
      toast.error("网络异常，删除失败");
    }
  };

  const defaultBodies: Record<string, string> = {
    "/v1/rfp/parse": JSON.stringify({
      document_url: "https://example.com/rfp-document.pdf",
      parse_options: {
        extract_sections: ["requirements", "timeline"],
        output_format: "markdown"
      }
    }, null, 2),
    "/v1/prd/generate": JSON.stringify({
      requirement_text: "开发一个智慧水利调度大屏，需要能展示库容和异常报警",
      prd_template: "standard_enterprise",
      generate_options: {
        include_use_cases: true,
        include_db_schema: true
      }
    }, null, 2),
    "/v1/gateway/route": JSON.stringify({
      prompt: "分析这段代码是否有内存泄漏隐患",
      fallback_models: ["gpt-4o", "deepseek-coder"],
      temperature: 0.2
    }, null, 2)
  };

  const updateSandboxBody = (endpoint: string) => {
    setSandboxBody(defaultBodies[endpoint] || "");
  };

  useEffect(() => {
    setSandboxBody(defaultBodies["/v1/rfp/parse"]);
  }, []);

  const runSandboxTest = async () => {
    if (!sandboxKey) {
      toast.error("请先生成或选择 API Key 授权令牌！");
      return;
    }
    
    try {
      JSON.parse(sandboxBody);
    } catch (e) {
      toast.error("请求体不是有效的 JSON 格式");
      return;
    }

    setTestingSandbox(true);
    setSandboxStatus(null);
    setSandboxOutput("⏳ 正在建立 TLS 1.3 双向安全信道连接...\n⏳ 正在验证 Bearer Token 签名与数据库授权...\n⏳ 正在调度知阁舟坊智能运行时沙盒...");

    try {
      const selectedKeyObj = apiKeys.find((k) => k.key === sandboxKey);
      let authHeaderValue = sandboxKey;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (
        selectedKeyObj &&
        selectedKeyObj.id !== "key-demo" &&
        sandboxKey.includes("*")
      ) {
        authHeaderValue = `keyId_${selectedKeyObj.id}`;
      }

      headers["Authorization"] = `Bearer ${authHeaderValue}`;
      if (userState.userInfo?.id) {
        headers["X-User-Id"] = userState.userInfo.id;
      }

      const res = await fetch(`/api/developers/sandbox?endpoint=${encodeURIComponent(sandboxEndpoint)}`, {
        method: "POST",
        headers,
        body: sandboxBody
      });

      const json = await res.json();
      setSandboxStatus(res.status);
      
      if (res.ok && json.success) {
        setSandboxOutput(JSON.stringify(json.data, null, 2));
        toast.success("API 沙盒执行成功！已保存任务与审计记录至数据库。");
      } else {
        setSandboxOutput(JSON.stringify(json, null, 2));
        toast.error(json.message || "API 执行失败");
      }
    } catch (error) {
      console.error("Sandbox run error:", error);
      setSandboxOutput(`❌ 网络连接异常\n${error instanceof Error ? error.message : String(error)}`);
      toast.error("连接网络失败，请检查服务状态");
    } finally {
      setTestingSandbox(false);
    }
  };

  const downloadScaffolding = () => {
    const composeContent = `version: '3.8'
services:
  zhige-core:
    image: registry.zhige-dockyard.com/core/engine:v1.0.0
    container_name: zhige_core_service
    environment:
      - DATABASE_TYPE=${scaffoldDb}
      - HARDWARE_ACCEL=${scaffoldHardware}
      - ISOLATION_LEVEL=MAX
      - ENCRYPTION_KEY=${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    restart: always
`;
    const shellScript = `#!/bin/bash
# ZhiGe Dockyard - One-Click Self-Hosted Scaffolding Setup
# Target OS: ${scaffoldOs}
# Mode: ${scaffoldMode}
# Database: ${scaffoldDb}
# Accelerator: ${scaffoldHardware}
# Generated: ${new Date().toLocaleString()}

echo "🚢 [ZhiGe Guard] 正在初始化私有化运行时环境..."
echo "🔍 检查本地 Docker & Docker-Compose 环境..."
if ! command -v docker &> /dev/null; then
    echo "❌ 错误: 未检测到 Docker 守护进程，请先安装 Docker！"
    exit 1
fi

echo "📦 正在建立本地持久化存储目录..."
mkdir -p data logs

echo "✏️ 正在写入 docker-compose.yml 配置文件..."
cat << 'EOF' > docker-compose.yml
${composeContent}EOF

echo "🚀 正在拉起私有化容器集群..."
docker-compose up -d

echo "✅ 部署完成！知阁舟坊智能中枢现已成功运行在 http://localhost:8080"
`;
    const blob = new Blob([shellScript], { type: "application/x-sh" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zhige-dockyard-setup.sh`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("一键部署脚手架脚本 (zhige-dockyard-setup.sh) 生成并打包下载成功！");
  };

  const toggleSection = (title: string) => {
    setExpandedSections((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
    );
  };

  const copyCode = () => {
    navigator.clipboard.writeText(apiExampleCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const copyResponse = () => {
    navigator.clipboard.writeText(responseExample);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 1500);
  };

  useEffect(() => {
    const handleScroll = () => {
      const sections = ["api-key-manager", "overview", "parameters", "example", "response", "api-sandbox", "scaffolding-wizard"];
      const scrollPosition = window.scrollY + 200;
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const element = document.getElementById(sections[i]);
        if (element && element.offsetTop <= scrollPosition) {
          setActiveSection(sections[i]);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
      <div className="absolute bottom-10 right-[-10%] w-[40%] h-[40%] bg-purple-500/[0.04] rounded-full blur-[120px] pointer-events-none" />

      {/* Header Top Bar */}
      <div className="relative z-20 bg-white/60 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md shadow-[#2b6cb0]/20">
              <FileCode className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-800 leading-tight">开发者文档</h1>
              <p className="text-[10px] text-slate-500 mt-0.5 font-bold">API Reference & Integration Guide</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded">v1.0.0</span>
            <button 
              onClick={() => router.push("/auth/login?redirect=/developers")}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              获取 API Key
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar navigation */}
        <aside className="w-full lg:w-64 shrink-0">
          <nav className="bg-white/70 backdrop-blur-md rounded-[20px] border border-white/80 overflow-hidden sticky top-20 shadow-sm">
            {sidebarItems.map((section) => (
              <div key={section.title} className="border-b border-slate-100/60 last:border-b-0">
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-white/50 transition-colors"
                >
                  <span className="text-xs font-black text-slate-700">{section.title}</span>
                  {expandedSections.includes(section.title) ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                {expandedSections.includes(section.title) && (
                  <ul className="bg-slate-50/50 border-t border-slate-100/60 py-1">
                    {section.children.map((item) => (
                      <li key={item.title}>
                        <a
                          href={item.href}
                          className="block px-4 py-2 text-xs font-bold text-slate-600 hover:text-[#2b6cb0] hover:bg-white transition-colors pl-8"
                        >
                          {item.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content documentation */}
        <main className="flex-1 min-w-0">
          <div className="bg-white/80 backdrop-blur-xl rounded-[24px] border border-white p-6 md:p-8 shadow-md">
            
            {/* API Key Manager Card */}
            <div id="api-key-manager" className="mb-10 border-b border-slate-100 pb-8">
              <h3 className="text-base font-black text-slate-800 mb-2 flex items-center gap-2">
                <Key className="w-5 h-5 text-[#2b6cb0]" />
                API 密钥管理 (API Key Manager)
              </h3>
              <p className="text-xs text-slate-500 mb-4 font-bold">
                生成和管理您的接口调用密钥，所有请求必须通过 Bearer 令牌鉴权。
              </p>
              
              <div className="flex gap-2.5 mb-4 flex-wrap">
                <input 
                  type="text"
                  placeholder="密钥别名 (如: 开发环境测试)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="zg-input max-w-xs"
                />
                <button
                  onClick={generateKey}
                  className="zg-btn zg-btn-primary text-xs flex items-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  生成密钥
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-left">
                      <th className="px-4 py-2 text-[10px] font-black text-slate-600">名称</th>
                      <th className="px-4 py-2 text-[10px] font-black text-slate-600">API Key</th>
                      <th className="px-4 py-2 text-[10px] font-black text-slate-600">生成时间</th>
                      <th className="px-4 py-2 text-[10px] font-black text-slate-600 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="bg-white hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-bold text-slate-700">{k.name}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600 flex items-center gap-1.5">
                          <span>{k.key.substring(0, 10)}...{k.key.substring(k.key.length - 8)}</span>
                          <button
                            onClick={() => copyKeyText(k.key, k.id)}
                            className="text-[#2b6cb0] hover:text-[#3182ce] cursor-pointer"
                          >
                            {copiedKeyId === k.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{k.createdAt}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => deleteKey(k.id)}
                            className="text-red-500 hover:text-red-650 text-[10px] font-black cursor-pointer"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                    {apiKeys.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-400 font-bold">
                          暂无可用密钥，请在上方创建生成。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Header description */}
            <div id="rfp-parse" className="mb-10">
              <span className="text-xs bg-[#2b6cb0]/10 text-[#2b6cb0] font-black px-2.5 py-1 rounded-md">
                核心接口规范
              </span>
              <h2 className="text-2xl font-black text-slate-800 mt-3 mb-4">标书智能解析 API</h2>
              <p className="text-slate-600 text-xs md:text-sm leading-relaxed font-medium">
                通过 API 异步调用知阁舟坊的核心解析能力。支持对大容量的 PDF、DOCX 招标文档进行智能要素提取，自动输出包含需求要点、废标红线与履约指标的结构化 JSON。
              </p>
            </div>

            {/* Overview Section */}
            <div id="overview" className="mb-10">
              <h3 className="text-base font-black text-slate-800 mb-4 border-l-4 border-[#2b6cb0] pl-3">接口概述</h3>
              <div className="bg-slate-50/80 p-5 rounded-xl border border-slate-100">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 text-xs font-black rounded-md">POST</span>
                  <code className="font-mono text-xs text-[#2b6cb0] font-black">/v1/rfp/parse</code>
                </div>
                <p className="text-xs text-slate-600 font-bold">解析招标文档，提取并归纳关键合规要点。</p>
              </div>
            </div>

            {/* Parameter Table */}
            <div id="parameters" className="mb-10">
              <h3 className="text-base font-black text-slate-800 mb-4 border-l-4 border-[#2b6cb0] pl-3">请求参数</h3>
              <div className="overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-4 py-3 text-left text-xs font-black text-slate-700">参数名</th>
                        <th className="px-4 py-3 text-left text-xs font-black text-slate-700">类型</th>
                        <th className="px-4 py-3 text-left text-xs font-black text-slate-700">必填</th>
                        <th className="px-4 py-3 text-left text-xs font-black text-slate-700">说明</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      <tr className="bg-white">
                        <td className="px-4 py-3 font-mono text-[#2b6cb0] font-bold">document_url</td>
                        <td className="px-4 py-3 text-slate-500 font-bold">string</td>
                        <td className="px-4 py-3 text-emerald-600 font-black">是</td>
                        <td className="px-4 py-3 text-slate-600 font-medium">招标文档在私有存储中的公开或预签名 URL</td>
                      </tr>
                      <tr className="bg-slate-50/50">
                        <td className="px-4 py-3 font-mono text-[#2b6cb0] font-bold">parse_options</td>
                        <td className="px-4 py-3 text-slate-500 font-bold">object</td>
                        <td className="px-4 py-3 text-slate-400 font-black">否</td>
                        <td className="px-4 py-3 text-slate-600 font-medium">解析微调参数（包含需要提取的特定章节配置）</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Request Code Block */}
            <div id="example" className="mb-10">
              <h3 className="text-base font-black text-slate-800 mb-4 border-l-4 border-[#2b6cb0] pl-3">请求示例</h3>
              <div className="relative bg-slate-950 rounded-xl overflow-hidden shadow-lg border border-white/5">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/5">
                  <span className="text-[10px] text-slate-500 font-mono font-bold">bash / curl</span>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-500 font-bold">已复制!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="font-bold">复制代码</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed">
                  <code className="text-slate-300">
                    <span className="text-purple-400 font-bold">curl</span>{" "}
                    <span className="text-cyan-400">-X POST</span>{" "}
                    <span className="text-emerald-400">"https://api.zhige-dockyard.com/v1/rfp/parse"</span> \{"\n"}
                    {"  "}<span className="text-blue-400">-H</span>{" "}
                    <span className="text-yellow-400">"Content-Type: application/json"</span> \{"\n"}
                    {"  "}<span className="text-blue-400">-H</span>{" "}
                    <span className="text-yellow-400">"Authorization: Bearer YOUR_API_KEY"</span> \{"\n"}
                    {"  "}<span className="text-blue-400">-d</span>{" "}
                    <span className="text-orange-400">'&#123;
    "document_url": "https://example.com/rfp-document.pdf",
    "parse_options": &#123;
      "extract_sections": ["requirements", "timeline"],
      "output_format": "markdown"
    &#125;
  &#125;'</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* Response Code Block */}
            <div id="response" className="mb-6">
              <h3 className="text-base font-black text-slate-800 mb-4 border-l-4 border-[#2b6cb0] pl-3">响应格式</h3>
              <div className="relative bg-slate-950 rounded-xl overflow-hidden shadow-lg border border-white/5">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-white/5">
                  <span className="text-[10px] text-slate-500 font-mono font-bold">JSON</span>
                  <button
                    onClick={copyResponse}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                  >
                    {copiedResponse ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-500 font-bold">已复制!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span className="font-bold">复制 JSON</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto font-mono text-xs leading-relaxed">
                  <code className="text-slate-300">
                    <span className="text-orange-300">&#123;</span>{"\n"}
                    <span className="text-purple-400">  "success"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-cyan-400 font-bold">true</span>
                    <span className="text-slate-400">,</span>{"\n"}
                    <span className="text-purple-400">  "data"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-orange-300">&#123;</span>{"\n"}
                    <span className="text-purple-400">    "document_id"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-emerald-400">"rfp-123456789"</span>
                    <span className="text-slate-400">,</span>{"\n"}
                    <span className="text-purple-400">    "processing_time"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-cyan-400 font-bold">4.2</span>
                    <span className="text-slate-400">,</span>{"\n"}
                    <span className="text-purple-400">    "token_usage"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-cyan-400 font-bold">1560</span>{"\n"}
                    <span className="text-orange-300">  &#125;</span>{"\n"}
                    <span className="text-orange-300">&#125;</span>
                  </code>
                </pre>
              </div>
            </div>

            {/* RESTful API Sandbox Card */}
            <div id="api-sandbox" className="mt-12 pt-8 border-t border-slate-100 mb-10">
              <h3 className="text-base font-black text-slate-800 mb-2 flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500 animate-pulse" />
                API 在线沙盒测试 (RESTful API Sandbox)
              </h3>
              <p className="text-xs text-slate-500 mb-4 font-bold">
                在线模拟调用舟坊组件接口，验证请求参数并立即查看返回格式。
              </p>

              <div className="grid md:grid-cols-12 gap-5">
                <div className="md:col-span-5 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">测试接口</label>
                    <select
                      value={sandboxEndpoint}
                      onChange={(e) => {
                        setSandboxEndpoint(e.target.value);
                        updateSandboxBody(e.target.value);
                      }}
                      className="zg-input"
                    >
                      <option value="/v1/rfp/parse">POST /v1/rfp/parse (标书解析)</option>
                      <option value="/v1/prd/generate">POST /v1/prd/generate (需求转PRD)</option>
                      <option value="/v1/gateway/route">POST /v1/gateway/route (多模型路由)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">API Key 授权令牌</label>
                    <select
                      value={sandboxKey}
                      onChange={(e) => setSandboxKey(e.target.value)}
                      className="zg-input"
                    >
                      <option value="">-- 请选择 API 密钥 --</option>
                      {apiKeys.map((k) => (
                        <option key={k.id} value={k.key}>{k.name} ({k.key.substring(0, 8)}...)</option>
                      ))}
                      <option value="temp_key_demo">演示测试密钥 (Demo Key)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 mb-1">JSON 请求体</label>
                    <textarea
                      rows={5}
                      value={sandboxBody}
                      onChange={(e) => setSandboxBody(e.target.value)}
                      className="zg-input font-mono text-[11px]"
                    />
                  </div>

                  <button
                    onClick={runSandboxTest}
                    disabled={testingSandbox}
                    className="zg-btn zg-btn-primary text-xs w-full flex items-center justify-center gap-1.5"
                  >
                    {testingSandbox ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        正在运行沙箱调试...
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        发送请求 (Send Request)
                      </>
                    )}
                  </button>
                </div>

                <div className="md:col-span-7 space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-slate-700">响应结果 (Response Output)</label>
                    {sandboxStatus && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        sandboxStatus === 200 ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-650 border border-red-200"
                      }`}>
                        Status: {sandboxStatus}
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-950 rounded-xl p-4 overflow-hidden border border-white/5 h-[280px] overflow-y-auto">
                    <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed text-left">
                      {sandboxOutput || "⚡ 点击左侧的“发送请求”按钮，响应的 JSON 结果将实时打印在此处。"}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* 私有部署向导 Card */}
            <div id="scaffolding-wizard" className="mt-12 pt-8 border-t border-slate-100">
              <h3 className="text-base font-black text-slate-800 mb-2 flex items-center gap-2">
                <Server className="w-5 h-5 text-emerald-600 animate-pulse" />
                私有部署脚手架配置向导 (Scaffolding Configurator)
              </h3>
              <p className="text-xs text-slate-500 mb-4 font-bold">
                根据您的物理服务器环境，动态生成一键安装与启动脚本。
              </p>

              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">操作系统 OS</label>
                  <select
                    value={scaffoldOs}
                    onChange={(e) => setScaffoldOs(e.target.value)}
                    className="zg-input"
                  >
                    <option value="linux">Linux (Ubuntu/CentOS)</option>
                    <option value="windows">Windows Server</option>
                    <option value="macos">macOS Enterprise</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">编排模式</label>
                  <select
                    value={scaffoldMode}
                    onChange={(e) => setScaffoldMode(e.target.value)}
                    className="zg-input"
                  >
                    <option value="docker">Docker-Compose (推荐)</option>
                    <option value="k8s">Kubernetes Helm Chart</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">数据库底座</label>
                  <select
                    value={scaffoldDb}
                    onChange={(e) => setScaffoldDb(e.target.value)}
                    className="zg-input"
                  >
                    <option value="dameng">达梦国产库 DM8</option>
                    <option value="kingbase">人大金仓 ES</option>
                    <option value="postgres">PostgreSQL 传统开源</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 mb-1">芯片硬件加速</label>
                  <select
                    value={scaffoldHardware}
                    onChange={(e) => setScaffoldHardware(e.target.value)}
                    className="zg-input"
                  >
                    <option value="ascend">华为昇腾 Ascend</option>
                    <option value="cambricon">寒武纪 MLU</option>
                    <option value="nvidia">Nvidia CUDA</option>
                    <option value="cpu">仅依赖 CPU 集群</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  onClick={downloadScaffolding}
                  className="zg-btn zg-btn-primary text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  生成一键部署脚手架
                </button>
              </div>
            </div>

          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <Link
              href="/docs"
              className="flex items-center gap-4 bg-white/70 backdrop-blur-md rounded-[20px] border border-white/80 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-11 h-11 bg-[#2b6cb0]/10 rounded-xl flex items-center justify-center text-[#2b6cb0] group-hover:bg-[#2b6cb0]/20 transition-colors">
                <BookOpen className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 mb-1">查看 RESTful API 手册</h4>
                <p className="text-xs text-slate-500 font-medium">查看各组件详细的输入契约与接口说明</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 ml-auto group-hover:text-[#2b6cb0] group-hover:translate-x-1 transition-all" />
            </Link>

            <Link
              href="/security"
              className="flex items-center gap-4 bg-white/70 backdrop-blur-md rounded-[20px] border border-white/80 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-11 h-11 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-600 group-hover:bg-emerald-500/20 transition-colors">
                <Download className="w-5.5 h-5.5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 mb-1">下载私有化部署脚手架</h4>
                <p className="text-xs text-slate-500 font-medium">获取容器化 Docker & K8s 环境一键拉起脚本</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 ml-auto group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
            </Link>
          </div>
        </main>

        {/* Right Sidebar - Scroll navigation */}
        <aside className="w-full lg:w-56 shrink-0">
          <div className="bg-white/70 backdrop-blur-md rounded-[20px] border border-white/80 p-4 sticky top-20 shadow-sm">
            <h4 className="text-xs font-black text-slate-700 mb-3.5 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              当前页目录
            </h4>
            <ul className="space-y-1">
              {tableOfContents.map((item) => {
                const isActive = activeSection === item.href.replace("#", "");
                return (
                  <li key={item.title}>
                    <a
                      href={item.href}
                      className={`block text-xs py-2 font-bold transition-all duration-200 ${
                        isActive
                          ? "text-[#2b6cb0] border-l-2 border-[#2b6cb0] pl-3"
                          : "text-slate-500 hover:text-[#2b6cb0] hover:pl-2"
                      }`}
                    >
                      {item.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>

      <Footer />
    </div>
  );
}
