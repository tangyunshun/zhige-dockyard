"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";
import Footer from "@/components/Footer";
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
  RefreshCw,
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
  const [urlError, setUrlError] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);
  const [selectedDetailWebhook, setSelectedDetailWebhook] = useState<Webhook | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const eventTypes = [
    { id: "component.bind", label: "组件授权绑定 (component.bind)", desc: "当空间被分配/采购新组件时触发" },
    { id: "member.join", label: "成员加入审批 (member.join)", desc: "当有新协同成员接受邀请码加入时触发" },
    { id: "token.limit", label: "算力额度警戒 (token.limit)", desc: "当算力 Token 消耗比例突破 80% 或 95% 时触发" },
    { id: "sandbox.reset", label: "开发环境清空 (sandbox.reset)", desc: "当空间数据发生一键清空重置操作时触发" },
  ];

  const eventLabelMap: Record<string, string> = {
    "component.bind": "组件授权绑定 (component.bind)",
    "member.join": "成员加入审批 (member.join)",
    "token.limit": "算力额度警戒 (token.limit)",
    "sandbox.reset": "开发环境清空 (sandbox.reset)",
  };

  const getEventLabel = (evtId: string) => {
    return eventLabelMap[evtId] || evtId;
  };

  // 1. 真实从数据库获取用户订阅列表（支持局部静默刷新）
  const fetchWebhooks = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setInitialLoading(true);
      }
      const res = await fetch("/api/webhooks");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.webhooks)) {
          setWebhooks(data.webhooks);
          if (isManualRefresh) {
            toast.success("已完成局部数据更新");
          }
        }
      }
    } catch (err) {
      console.error("加载 Webhooks 列表失败:", err);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWebhooks(false);
  }, []);

  const handleToggleEvent = (eventId: string) => {
    setSelectedEvents((prev) => {
      const next = prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId];
      if (next.length > 0) setEventsError("");
      return next;
    });
  };

  const paginatedWebhooks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return webhooks.slice(start, start + pageSize);
  }, [webhooks, currentPage, pageSize]);

  // 2. 真实新增持久化 Webhook 订阅
  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;
    const cleanUrl = url.trim();

    if (!cleanUrl) {
      setUrlError("请输入 Webhook 目标回调 Endpoint URL");
      hasError = true;
    } else if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      setUrlError("Webhook 目标回调地址必须是以 http:// 或 https:// 开头的合法 URL");
      hasError = true;
    } else {
      setUrlError("");
    }

    if (selectedEvents.length === 0) {
      setEventsError("请至少选择一项要订阅的事件类别");
      hasError = true;
    } else {
      setEventsError("");
    }

    if (hasError) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: cleanUrl, events: selectedEvents }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.webhook) {
          setWebhooks((prev) => [data.webhook, ...prev]);
          setCurrentPage(1);
          setUrl("");
          setUrlError("");
          setEventsError("");
          toast.success("Webhook 订阅通道已成功建立并写入数据库");
        }
      } else {
        const errData = await res.json();
        const msg = errData.error || "创建 Webhook 失败";
        if (msg.includes("重复") || msg.includes("已存在")) {
          setUrlError(msg);
        } else {
          toast.error(msg);
        }
      }
    } catch (err: any) {
      console.error("创建 Webhook 异常:", err);
      toast.error(err.message || "网络异常，创建 Webhook 失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 3. 真实删除数据库 Webhook 订阅 (二次确认安全触发)
  const handleDeleteWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/webhooks?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setWebhooks((prev) => {
          const next = prev.filter((w) => w.id !== id);
          const maxPage = Math.ceil(next.length / pageSize) || 1;
          if (currentPage > maxPage) {
            setCurrentPage(maxPage);
          }
          return next;
        });
        toast.success("已成功移除非法 Webhook 订阅");
      } else {
        const errData = await res.json();
        toast.error(errData.error || "删除失败");
      }
    } catch (err: any) {
      toast.error(err.message || "删除 Webhook 失败");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // 4. 真实切换启停状态
  const handleToggleActive = async (id: string) => {
    try {
      const res = await fetch("/api/webhooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "toggle" }),
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks((prev) =>
          prev.map((w) => (w.id === id ? { ...w, active: data.active } : w))
        );
        toast.info(data.active ? "已开启该 Webhook 消息推发" : "已暂停该 Webhook 消息推发");
      }
    } catch (err: any) {
      toast.error("切换 Webhook 状态失败");
    }
  };

  // 5. 真实发起 HTTP POST 通信测试
  const handleTestWebhook = async (id: string) => {
    try {
      setTestingWebhookId(id);
      const res = await fetch("/api/webhooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "test" }),
      });
      if (res.ok) {
        const data = await res.json();
        setWebhooks((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  lastTriggered: data.lastTriggered,
                  successRate: data.isRealSuccess ? "100%" : "0%",
                }
              : w
          )
        );
        if (data.isRealSuccess) {
          toast.success(data.message || `🟢 真实 HTTP 推发成功！目标 Endpoint 响应 ${data.httpStatus} OK (${data.durationMs}ms)`);
        } else {
          toast.error(data.message || `🔴 真实 HTTP 推发异常！目标 Endpoint 响应 ${data.httpStatus} (${data.durationMs}ms)`);
        }
      }
    } catch (err: any) {
      toast.error("测试 Webhook 异常，无法连通目标服务器");
    } finally {
      setTestingWebhookId(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("签名密钥 Secret 已成功复制到剪贴板");
  };

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 flex flex-col selection:bg-indigo-100 selection:text-indigo-600">
      {/* 主面板内容 */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto p-4 md:px-8 md:py-6 space-y-6 text-left">
        {/* 精美顶部路径与面包屑 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400 font-semibold">
            <button
              onClick={() => router.push("/workspace-hub")}
              className="px-3 py-1.5 rounded-xl bg-white/80 hover:bg-white text-slate-600 hover:text-indigo-600 border border-white/90 shadow-2xs transition-all flex items-center gap-1.5 font-bold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              返回空间中枢
            </button>
            <span className="text-slate-300">/</span>
            <span>配置中心</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-700 font-bold">Webhooks 事件订阅</span>
          </div>
        </div>

        {/* 头部标题卡片 */}
        <div className="bg-white/80 border border-white/90 rounded-[24px] p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-xs">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">
                  Webhooks 事件订阅中心
                </h1>
                <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-full font-bold">
                  Open API v2.0
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                建立系统级 HTTP 回调监听。当组件装配、协同成员变动或算力消耗警报触发时，系统将主动发送 JSON 数据包至您的 Endpoint。
              </p>
            </div>
          </div>
        </div>

        {/* 通俗易懂小白指南卡片 */}
        <div className="bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/50 border border-indigo-100 rounded-[24px] p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-sm">
            <Terminal className="w-4 h-4 text-indigo-600" />
            💡 什么是 Webhooks？快速上手指南
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 bg-white/90 rounded-xl border border-indigo-100/70 space-y-1.5">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">1</span>
                什么是 Webhook？
              </div>
              <p className="text-slate-500 font-medium leading-relaxed">
                就像“快递发货短信”，当您在舟坊发生新动态（如有人加入、组件授权、算力警告），系统会主动把消息发到您填写的网址，无需手动刷新。
              </p>
            </div>

            <div className="p-3.5 bg-white/90 rounded-xl border border-indigo-100/70 space-y-1.5">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">2</span>
                常见的用途有哪些？
              </div>
              <p className="text-slate-500 font-medium leading-relaxed">
                可推送到钉钉/飞书/企业微信群机器人、联动您自己的服务器自动触发脚本、或自动将日志同步写入您自建的数据库。
              </p>
            </div>

            <div className="p-3.5 bg-white/90 rounded-xl border border-indigo-100/70 space-y-1.5">
              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">3</span>
                简单 3 步如何使用？
              </div>
              <p className="text-slate-500 font-medium leading-relaxed">
                ① 填入接收通知的网址 ➔ ② 勾选关注的动态事件 ➔ ③ 点击“创建并激活”，点击右侧【测试 Payload】按钮发送模拟测试消息！
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-indigo-100/50 flex flex-wrap items-center gap-4 text-[11px] text-slate-500">
            <span className="font-bold text-slate-700">📖 名词小字典：</span>
            <span><strong className="text-indigo-600">Endpoint URL</strong> = 您的接收通知网址</span>
            <span><strong className="text-indigo-600">HMAC Secret</strong> = 验证消息来源防伪造的数字密码</span>
            <span><strong className="text-indigo-600">Payload</strong> = 包含事件具体数据的 JSON 消息体</span>
          </div>
        </div>

        {/* 新建订阅表单 */}
        <div className="bg-white/80 border border-white/90 rounded-[24px] p-8 shadow-sm space-y-6">
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Plus className="w-4 h-4 text-indigo-500" />
            新增 Webhook 监听订阅
          </h2>

          <form onSubmit={handleAddWebhook} noValidate className="space-y-6">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="block text-xs font-bold text-slate-700">
                  Webhook 目标回调 Endpoint URL <span className="text-red-500">*</span>
                </label>
                {/* 快捷示例填入按钮 */}
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-slate-400 font-bold">快捷填充:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUrl(`https://api.zhige.io/webhooks/mock-${Math.random().toString(36).substring(2, 8)}`);
                      if (urlError) setUrlError("");
                      toast.info("已生成测试模拟 URL，可直接点击下方【创建并激活订阅】！");
                    }}
                    className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 rounded-md font-bold transition-all cursor-pointer"
                  >
                    ⚡ 一键模拟 URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrl("https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN");
                      if (urlError) setUrlError("");
                    }}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-bold transition-all cursor-pointer"
                  >
                    🤖 钉钉机器人
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrl("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY");
                      if (urlError) setUrlError("");
                    }}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md font-bold transition-all cursor-pointer"
                  >
                    💬 企业微信
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (urlError) setUrlError("");
                }}
                placeholder="https://api.yourdomain.com/webhooks/zhige-receiver"
                className={`w-full px-4 h-11 text-xs font-mono border rounded-xl outline-none transition-all bg-white ${
                  urlError
                    ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                    : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                }`}
              />
              {urlError ? (
                <p className="text-[11px] text-red-500 font-bold flex items-center gap-1.5 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  {urlError}
                </p>
              ) : (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-slate-400 font-medium">
                    必须为公网可访问的 HTTPS 或 HTTP 目标地址，接收 HTTP POST 请求。
                  </p>
                  
                  {/* ❓ URL 从哪里获取指南说明 */}
                  <div className="p-3 bg-slate-50/90 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 space-y-2">
                    <div className="font-bold text-slate-700 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                      ❓ 我该从哪里获取这个 URL 地址？
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="p-2 bg-white rounded-lg border border-slate-100">
                        <strong className="text-indigo-600 block mb-0.5">选项 A: 办公群机器人</strong>
                        在钉钉、飞书、企业微信群设置里添加“自定义机器人”，复制机器人的 Webhook 地址填入。
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-100">
                        <strong className="text-indigo-600 block mb-0.5">选项 B: 您自建的服务 API</strong>
                        在您的后端服务（如 Node/Java/Python）中开放一个支持接收 POST 请求的公网网址。
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-100">
                        <strong className="text-indigo-600 block mb-0.5">选项 C: 免费在线测试网</strong>
                        若仅需测试，可点击上方【⚡ 一键模拟 URL】或使用 Webhook.site 获取临时免费地址。
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700">
                选择订阅触发的事件类别 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {eventTypes.map((evt) => {
                  const checked = selectedEvents.includes(evt.id);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => handleToggleEvent(evt.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        checked
                          ? "bg-indigo-50/50 border-indigo-200 shadow-2xs"
                          : "bg-slate-50/50 border-slate-200/60 hover:bg-slate-100/50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {}}
                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block leading-tight">
                          {evt.label}
                        </span>
                        <span className="text-[11px] text-slate-400 font-semibold block mt-1 leading-normal">
                          {evt.desc}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {eventsError && (
                <p className="text-[11px] text-red-500 font-bold flex items-center gap-1.5 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500" />
                  {eventsError}
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {submitting ? "创建中..." : "创建并激活订阅"}
              </button>
            </div>
          </form>
        </div>

        {/* 建立的订阅列表 */}
        <div className="bg-white/80 border border-white/90 rounded-[24px] p-8 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-500" />
              已建立的 Webhooks 订阅列表
            </h2>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => fetchWebhooks(true)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1.5 border-none bg-transparent cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "正在更新..." : "刷新数据"}
            </button>
          </div>

          {initialLoading ? (
            <div className="py-12 text-center text-xs text-slate-400 font-semibold">
              数据拉取中，正在连接 Webhooks 数据库...
            </div>
          ) : webhooks.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 rounded-2xl">
              <p className="text-xs text-slate-400 font-semibold mb-3">暂无已建立的 Webhooks 订阅</p>
              <p className="text-[11px] text-slate-400">在上表单中提交 Endpoint URL 即可创建您的第一个实时事件推发订阅。</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-4">
                {paginatedWebhooks.map((wh) => (
                  <div
                    key={wh.id}
                    className="p-5 border border-slate-200/70 rounded-2xl bg-white shadow-2xs hover:shadow-xs transition-all space-y-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            {wh.id}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-black border ${
                              wh.active
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                : "bg-slate-100 text-slate-400 border-slate-200"
                            }`}
                          >
                            {wh.active ? "运行中 (ACTIVE)" : "已暂停 (PAUSED)"}
                          </span>
                        </div>
                        <p className="font-mono text-xs font-bold text-slate-800 truncate leading-snug">
                          {wh.url}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setSelectedDetailWebhook(wh)}
                          className="text-xs px-3 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Code className="w-3.5 h-3.5 text-indigo-500" />
                          查看报文与配置
                        </button>
                        <button
                          onClick={() => handleToggleActive(wh.id)}
                          className="text-xs px-3 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold transition-all cursor-pointer"
                        >
                          {wh.active ? "暂停推发" : "恢复推发"}
                        </button>
                        <button
                          onClick={() => handleTestWebhook(wh.id)}
                          disabled={testingWebhookId === wh.id}
                          className="text-xs px-3 h-8 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {testingWebhookId === wh.id ? "推发中..." : "测试 Payload"}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(wh.id)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all border-none bg-transparent cursor-pointer"
                          title="删除订阅"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Secret 秘钥展示 */}
                    <div className="flex items-center justify-between p-3 bg-slate-50/70 rounded-xl border border-slate-100 text-xs">
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-slate-400 font-bold shrink-0">HMAC 签名 Secret:</span>
                        <span className="font-mono text-slate-700 font-bold truncate">{wh.secret}</span>
                      </div>
                      <button
                        onClick={() => copyToClipboard(wh.secret)}
                        className="text-[#2b6cb0] hover:underline font-bold flex items-center gap-1 border-none bg-transparent cursor-pointer shrink-0 ml-2"
                      >
                        <Copy className="w-3.5 h-3.5" /> 复制
                      </button>
                    </div>

                    {/* 详细属性与时间 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-medium pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-600">已订阅事件:</span>
                        {wh.events?.map((evtId) => (
                          <span key={evtId} className="px-2 py-0.5 bg-indigo-50/80 text-indigo-700 border border-indigo-100/90 rounded-md font-bold text-[11px]">
                            {getEventLabel(evtId)}
                          </span>
                        ))}
                      </div>
                      <div>
                        上次触发: <span className="font-mono text-slate-600 font-bold">{wh.lastTriggered}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 每页 5 条数据的标准 Pagination 分页器 */}
              {webhooks.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={webhooks.length}
                    pageSize={pageSize}
                    onPageChange={(page) => setCurrentPage(page)}
                    itemLabel="个订阅通道"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* 详细报文与配置 Modal */}
      {selectedDetailWebhook && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] border border-white/90 shadow-2xl max-w-2xl w-full max-h-[85vh] p-6 flex flex-col animate-fadeIn text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100">
                  {selectedDetailWebhook.id}
                </span>
                <h3 className="text-base font-extrabold text-slate-800">Webhook 报文详情与推发指南</h3>
              </div>
              <button
                onClick={() => setSelectedDetailWebhook(null)}
                className="text-slate-400 hover:text-slate-600 font-bold border-none bg-transparent cursor-pointer text-sm"
              >
                ✕ 关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs py-3 my-1 pr-1">
              <div>
                <label className="text-slate-400 font-bold block mb-1">目标 Endpoint URL 地址</label>
                <div className="p-3 bg-slate-50 font-mono text-slate-800 rounded-xl border border-slate-200 font-bold break-all">
                  {selectedDetailWebhook.url}
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">推送数据包 JSON Payload 示例结构</label>
                <pre className="p-3 bg-slate-900 text-indigo-300 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto">
{JSON.stringify(
  {
    event: selectedDetailWebhook.events[0] || "component.bind",
    timestamp: Date.now(),
    webhookId: selectedDetailWebhook.id,
    data: {
      workspaceId: "ws_demo_8888",
      action: "TRIGGER",
      operator: "Admin User",
      message: "知阁·舟坊系统事件触发"
    },
    signature: "sha256=" + selectedDetailWebhook.secret.substring(0, 16) + "..."
  },
  null,
  2
)}
                </pre>
              </div>

              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-slate-600 space-y-1">
                <div className="font-bold text-indigo-900">🔒 如何防伪验签 (HMAC-SHA256)？</div>
                <p>
                  每次推发时，系统会在 HTTP 请求 Header `x-zhige-signature` 中携带基于您密钥 Secret 计算的哈希签名。您可以拿着该 Secret 重新 HMAC-SHA256 签名报文体，校验是否完全一致。
                </p>
              </div>
            </div>

            <div className="pt-3 shrink-0 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => {
                  handleTestWebhook(selectedDetailWebhook.id);
                  setSelectedDetailWebhook(null);
                }}
                className="px-4 h-9 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs transition-all shadow-xs flex items-center gap-1 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                立即发送测试模拟包
              </button>
              <button
                onClick={() => setSelectedDetailWebhook(null)}
                className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 物理删除二次确认 Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] border border-white/90 shadow-2xl max-w-md w-full p-6 space-y-4 animate-fadeIn text-left">
            <div className="flex items-center gap-3 text-red-600 font-extrabold text-base">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>解绑并彻底删除订阅？</div>
            </div>

            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              确定要物理解绑并销毁 ID 为 <span className="font-mono font-bold text-slate-700">{deleteConfirmId}</span> 的 Webhook 监听通道吗？该操作不可逆，销毁后系统将终止向该目标 Endpoint 发送任何消息。
            </p>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <button
                onClick={() => handleDeleteWebhook(deleteConfirmId)}
                className="px-4 h-9 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                确认物理解绑删除
              </button>
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 h-9 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs transition-all cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
