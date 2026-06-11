"use client";

import { useState, useEffect } from "react";
import { Copy, Check, BookOpen, Download, ChevronRight, ChevronDown, FileCode, Zap } from "lucide-react";
import Footer from "@/components/Footer";

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
  { title: "接口概述", href: "#overview" },
  { title: "请求参数", href: "#parameters" },
  { title: "请求示例", href: "#example" },
  { title: "响应格式", href: "#response" },
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
      "evaluation_criteria": [...],
      "timeline": {...}
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
  const [expandedSections, setExpandedSections] = useState<string[]>(["快速入门", "API 参考"]);
  const [copied, setCopied] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

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
      const sections = ["overview", "parameters", "example", "response"];
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
    <div className="min-h-screen bg-[#f0f8ff] pt-17">
      {/* 文档页面内容从这里开始 */}
      <div className="pt-1">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <FileCode className="w-8 h-8 text-[#2b6cb0]" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">开发者文档</h1>
              <p className="text-sm text-slate-500">API 参考与集成指南</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">v1.0.0</span>
            <button className="px-4 py-2 bg-[#2b6cb0] text-white rounded-[4px] text-sm font-medium hover:bg-[#2c5282] transition-colors">
              获取 API Key
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
        {/* Left Sidebar */}
        <aside className="w-64 shrink-0">
          <nav className="bg-white rounded-[8px] border border-slate-100 overflow-hidden sticky top-20">
            {sidebarItems.map((section) => (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="font-medium text-slate-700">{section.title}</span>
                  {expandedSections.includes(section.title) ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>
                {expandedSections.includes(section.title) && (
                  <ul className="border-t border-slate-100">
                    {section.children.map((item) => (
                      <li key={item.title}>
                        <a
                          href={item.href}
                          className="block px-4 py-2.5 text-sm text-slate-600 hover:bg-[#2b6cb0]/5 hover:text-[#2b6cb0] transition-colors pl-8"
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

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="bg-white rounded-[8px] border border-slate-100 p-8">
            <div id="rfp-parse" className="mb-10">
              <h2 className="text-2xl font-bold text-slate-800 mb-4">标书智能解析 API</h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                通过 API 调用标书解析能力，自动提取招标需求要点、评估标准和时间线信息。
                本接口支持 PDF、DOCX 等多种文档格式，返回结构化的解析结果。
              </p>
            </div>

            <div id="overview" className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4">接口概述</h3>
              <div className="bg-slate-50 rounded-[8px] p-4 mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-bold rounded-full">POST</span>
                  <code className="font-mono text-[#2b6cb0]">/v1/rfp/parse</code>
                </div>
                <p className="text-sm text-slate-600">解析招标文档，提取关键信息</p>
              </div>
            </div>

            <div id="parameters" className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4">请求参数</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-200 px-4 py-2 text-left font-medium text-slate-700">参数名</th>
                      <th className="border border-slate-200 px-4 py-2 text-left font-medium text-slate-700">类型</th>
                      <th className="border border-slate-200 px-4 py-2 text-left font-medium text-slate-700">必填</th>
                      <th className="border border-slate-200 px-4 py-2 text-left font-medium text-slate-700">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 px-4 py-2 font-mono text-sm text-slate-700">document_url</td>
                      <td className="border border-slate-200 px-4 py-2 text-sm text-slate-600">string</td>
                      <td className="border border-slate-200 px-4 py-2 text-sm text-green-600">是</td>
                      <td className="border border-slate-200 px-4 py-2 text-sm text-slate-600">招标文档的公开 URL</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 px-4 py-2 font-mono text-sm text-slate-700">parse_options</td>
                      <td className="border border-slate-200 px-4 py-2 text-sm text-slate-600">object</td>
                      <td className="border border-slate-200 px-4 py-2 text-sm text-red-600">否</td>
                      <td className="border border-slate-200 px-4 py-2 text-sm text-slate-600">解析选项配置</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div id="example" className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4">请求示例</h3>
              <div className="relative bg-slate-900 rounded-[8px] overflow-hidden shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
                  <span className="text-xs text-slate-400 font-mono">bash</span>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3 text-green-500" />
                        <span className="text-green-500">已复制 ✓</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto font-mono text-sm leading-relaxed">
                  <code className="text-slate-300">
                    <span className="text-purple-400">curl</span>
                    <span className="text-cyan-300"> -X POST</span>
                    <span className="text-green-400"> "https://api.zhige-dockyard.com/v1/rfp/parse"</span>{"\n"}
                    <span className="text-blue-400">  -H</span>
                    <span className="text-yellow-300"> "Content-Type: application/json"</span>{"\n"}
                    <span className="text-blue-400">  -H</span>
                    <span className="text-yellow-300"> "Authorization: Bearer YOUR_API_KEY"</span>{"\n"}
                    <span className="text-blue-400">  -d</span>
                    <span className="text-orange-300"> '&#123;</span>{"\n"}
                    <span className="text-orange-300">    "document_url": "https://example.com/rfp-document.pdf"</span>{"\n"}
                    <span className="text-orange-300">  &#125;'</span>
                  </code>
                </pre>
              </div>
            </div>

            <div id="response" className="mb-8">
              <h3 className="text-lg font-bold text-slate-800 mb-4">响应格式</h3>
              <div className="relative bg-slate-900 rounded-[8px] overflow-hidden shadow-xl">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
                  <span className="text-xs text-slate-400 font-mono">json</span>
                  <button
                    onClick={copyResponse}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                  >
                    {copiedResponse ? (
                      <>
                        <Check className="w-3 h-3 text-green-500" />
                        <span className="text-green-500">已复制 ✓</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>复制</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto font-mono text-sm leading-relaxed">
                  <code className="text-slate-300">
                    <span className="text-orange-300">&#123;</span>{"\n"}
                    <span className="text-purple-400">  "success"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-cyan-400">true</span>
                    <span className="text-slate-400">,</span>{"\n"}
                    <span className="text-purple-400">  "data"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-orange-300">&#123;</span>{"\n"}
                    <span className="text-purple-400">    "document_id"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-green-400">"rfp-123456789"</span>
                    <span className="text-slate-400">,</span>{"\n"}
                    <span className="text-purple-400">    "processing_time"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-cyan-400">4.2</span>
                    <span className="text-slate-400">,</span>{"\n"}
                    <span className="text-purple-400">    "token_usage"</span>
                    <span className="text-slate-400">: </span>
                    <span className="text-cyan-400">1560</span>{"\n"}
                    <span className="text-orange-300">  &#125;</span>{"\n"}
                    <span className="text-orange-300">&#125;</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <a
              href="#api-docs"
              className="flex items-center gap-4 bg-white rounded-[8px] border border-slate-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-12 h-12 bg-[#2b6cb0]/10 rounded-[8px] flex items-center justify-center text-[#2b6cb0] group-hover:bg-[#2b6cb0]/20 transition-colors">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 mb-1">查看 RESTful API 手册</h4>
                <p className="text-sm text-slate-600">完整的 API 接口文档与示例</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 ml-auto group-hover:text-[#2b6cb0] transition-colors" />
            </a>

            <a
              href="#download-scaffold"
              className="flex items-center gap-4 bg-white rounded-[8px] border border-slate-100 p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
            >
              <div className="w-12 h-12 bg-green-500/10 rounded-[8px] flex items-center justify-center text-green-600 group-hover:bg-green-500/20 transition-colors">
                <Download className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 mb-1">下载私有化部署脚手架</h4>
                <p className="text-sm text-slate-600">Docker/K8s 部署配置与脚本</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-400 ml-auto group-hover:text-green-600 transition-colors" />
            </a>
          </div>
        </main>

        {/* Right Sidebar - Table of Contents */}
        <aside className="w-56 shrink-0">
          <div className="bg-white rounded-[8px] border border-slate-100 p-4 sticky top-20">
            <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              On this page
            </h4>
            <ul className="space-y-1">
              {tableOfContents.map((item) => {
                const isActive = activeSection === item.href.replace("#", "");
                return (
                  <li key={item.title}>
                    <a
                      href={item.href}
                      className={`block text-sm py-2 transition-all duration-200 ${
                        isActive
                          ? "text-[#2b6cb0] font-bold border-l-2 border-[#2b6cb0] pl-3"
                          : "text-slate-600 hover:text-[#2b6cb0] hover:pl-2"
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
