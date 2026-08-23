"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import {
  HelpCircle,
  ArrowLeft,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  Copy,
  Terminal,
  Activity,
  Code,
} from "lucide-react";

interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  successRate: string;
  lastTriggered: string;
}

export default function WebhooksPage() {
  const router = useRouter();
  const toast = useToast();

  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["component.bind"]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([
    {
      id: "wh_01h8v1y2z3",
      url: "https://api.yourdomain.com/webhooks/zhige-receiver",
      secret: "zg_sec_9A8B7C6D5E4F3G2H1I0J",
      events: ["component.bind", "member.join"],
      active: true,
      successRate: "100%",
      lastTriggered: "2026-06-21 06:12:45",
    },
  ]);

  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  const eventTypes = [
    { id: "component.bind", label: "组件授权绑定 (component.bind)", desc: "当空间被分配/采购新组件时触发" },
    { id: "member.join", label: "成员加入审批 (member.join)", desc: "当有新协同成员接受邀请码加入时触发" },
    { id: "token.limit", label: "算力额度警戒 (token.limit)", desc: "当算力 Token 消耗比例突破 80% 或 95% 时触发" },
    { id: "sandbox.reset", label: "开发环境清空 (sandbox.reset)", desc: "当空间数据发生一键清空重置操作时触发" },
  ];

  const handleToggleEvent = (eventId: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const handleAddWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast.error("Webhook 地址必须是以 http:// 或 https:// 开头的合法 URL");
      return;
    }
    if (selectedEvents.length === 0) {
      toast.error("请至少选择一项要订阅的事件类别");
      return;
    }

    const newWebhook: Webhook = {
      id: `wh_${Math.random().toString(36).substring(2, 12)}`,
      url,
      secret: `zg_sec_${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
      events: [...selectedEvents],
      active: true,
      successRate: "-",
      lastTriggered: "-",
    };

    setWebhooks((prev) => [...prev, newWebhook]);
    setUrl("");
    toast.success("Webhook 订阅通道已成功建立并上线");
  };

  const handleDeleteWebhook = (id: string) => {
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
    toast.success("已移除此 Webhook 订阅");
  };

  const handleToggleActive = (id: string) => {
    setWebhooks((prev) =>
      prev.map((w) => (w.id === id ? { ...w, active: !w.active } : w))
    );
    toast.info("已切换 Webhook 的启用状态");
  };

  const handleTestWebhook = async (id: string) => {
    setTestingWebhookId(id);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setTestingWebhookId(null);
    toast.success("Ping 测试报文已发送，接口响应 200 OK");
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    toast.success("密钥签名已复制到剪贴板");
  };

  const payloadSample = {
    event: "component.bind",
    timestamp: 1781997380,
    workspace: {
      id: "ws_personal_test01",
      name: "个人空间 - test-01",
      type: "PERSONAL",
    },
    operator: {
      id: "u_test01",
      name: "test-01",
    },
    data: {
      componentId: "C01",
      componentName: "RFP 标书解析",
      allocatedTokens: 50000,
    },
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden bg-[#f0f8ff]"
      style={{
        backgroundImage: "radial-gradient(rgba(49, 130, 206, 0.1) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.05] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.05] rounded-full blur-[120px] pointer-events-none" />

      {/* 顶部 Header */}
      <header className="relative z-20 flex items-center justify-between px-6 py-4 bg-white/60 backdrop-blur-md border-b border-slate-200/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="group flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl transition-all cursor-pointer border border-slate-200/40 shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            返回工作台
          </button>
          <Logo variant="light" />
        </div>
        
        <div className="flex items-center gap-2">
          <div className="px-3 py-1 bg-indigo-50 text-[#5a67d8] border border-indigo-100 rounded-lg text-xs font-bold flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>实时事件流推送通道</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-8 bg-gradient-to-r from-indigo-500/[0.03] to-[#3182ce]/[0.03] rounded-3xl p-8 border border-white/60 shadow-sm">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Terminal className="w-5 h-5 text-white" />
            </div>
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">
            Webhooks 事件订阅中心
          </h1>
          <p className="text-xs md:text-sm text-slate-500 max-w-xl mx-auto mt-2 font-semibold leading-relaxed">
            实时侦听知阁舟坊工作空间内的关键业务事件。当事件发生时，我们将以 JSON POST 报文形式发送数据到您的接口。
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* 左侧：新增订阅表单 */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Plus className="w-4 h-4 text-indigo-500" />
                新建事件订阅
              </h3>

              <form onSubmit={handleAddWebhook} className="space-y-4 text-left">
                
                {/* 目标 URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-slate-600 block">推送 URL 地址 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="https://api.example.com/webhooks"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#2b6cb0] font-semibold"
                  />
                </div>

                {/* 订阅事件 */}
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-600 block">订阅的事件类别 <span className="text-red-500">*</span></label>
                  <div className="grid gap-2.5">
                    {eventTypes.map((event) => {
                      const checked = selectedEvents.includes(event.id);
                      return (
                        <div
                          key={event.id}
                          onClick={() => handleToggleEvent(event.id)}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 select-none ${
                            checked
                              ? "border-[#2b6cb0] bg-[#2b6cb0]/5"
                              : "border-slate-200 bg-white/40 hover:bg-white/80"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            className="mt-0.5 accent-[#2b6cb0]"
                          />
                          <div>
                            <div className="text-xs font-black text-slate-700">{event.label}</div>
                            <div className="text-[10px] text-slate-400 font-semibold mt-0.5">{event.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="zg-btn zg-btn-primary w-full py-2.5 rounded-lg flex items-center justify-center gap-1.5 text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>上线此订阅通道</span>
                  </button>
                </div>

              </form>
            </div>

            {/* 已订阅列表 */}
            <div className="bg-white/80 backdrop-blur-xl border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Activity className="w-4 h-4 text-indigo-500" />
                正在运行的 Webhook 通道
              </h3>

              {webhooks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 font-bold border border-dashed rounded-xl">
                  暂无已建立的 Webhooks 订阅
                </div>
              ) : (
                <div className="space-y-4">
                  {webhooks.map((wh) => (
                    <div
                      key={wh.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white/50 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 rounded text-[9px] font-bold">
                              ID: {wh.id}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                wh.active
                                  ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                  : "bg-slate-50 text-slate-400 border-slate-200"
                              }`}
                            >
                              {wh.active ? "● 启用" : "○ 禁用"}
                            </span>
                          </div>
                          <div className="text-xs font-black text-slate-800 mt-2 truncate break-all">
                            {wh.url}
                          </div>
                        </div>

                        {/* 动作区 */}
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleTestWebhook(wh.id)}
                            disabled={testingWebhookId === wh.id}
                            className="p-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-lg cursor-pointer transition-colors"
                            title="测试发送 Ping 报文"
                          >
                            <Play className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(wh.id)}
                            className="p-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg cursor-pointer transition-colors"
                            title={wh.active ? "禁用订阅" : "启用订阅"}
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteWebhook(wh.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-lg cursor-pointer transition-colors"
                            title="物理删除此通道"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 密钥信息 */}
                      <div className="bg-slate-50/80 border border-slate-100 rounded-lg p-2 flex items-center justify-between gap-3 text-[10px] text-slate-500 font-bold">
                        <div className="truncate">
                          <span>密钥签名: </span>
                          <span className="font-mono text-slate-700 bg-white px-1 border rounded">{wh.secret}</span>
                        </div>
                        <button
                          onClick={() => handleCopySecret(wh.secret)}
                          className="flex items-center gap-0.5 text-indigo-600 hover:underline cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>复制</span>
                        </button>
                      </div>

                      {/* 推送审计 */}
                      <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 font-bold">
                        <div>
                          订阅事件: <span className="text-slate-600">{wh.events.length} 个</span>
                        </div>
                        <div>
                          推送成功率: <span className="text-[#059669]">{wh.successRate}</span>
                        </div>
                        <div className="truncate">
                          最近触发: <span className="text-slate-600">{wh.lastTriggered}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* 右侧：文档 Payload 示例 */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#1e293b] text-slate-300 rounded-2xl p-5 border border-slate-800 shadow-2xl space-y-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Code className="w-4.5 h-4.5 text-indigo-400" />
                Webhook POST JSON Payload 规范
              </h3>

              <div className="space-y-2 text-left">
                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                  每次事件触发后，我们会以 POST 请求形式，向您的 URL 发送如下的 application/json 格式消息：
                </p>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-[11px] overflow-auto leading-relaxed max-h-[360px] text-indigo-300">
                  <pre>{JSON.stringify(payloadSample, null, 2)}</pre>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 text-[10px] text-slate-400 font-bold leading-normal flex items-start gap-2 text-left">
                <HelpCircle className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-white">签名安全校验：</span>
                  为了验证请求是由知阁舟坊发送，我们会在 HTTP 请求 Header 中附带
                  <code className="text-indigo-300 bg-slate-900 px-1 border border-slate-800 rounded mx-1">X-ZhiGe-Signature</code>
                  标头。您可以结合密钥签名以 HMAC-SHA256 算法对比哈希值以核验身份安全。
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
