"use client";

import { useState, useEffect, useCallback } from "react";
import { getAuthToken } from "@/utils/auth";
import {
  Settings,
  Mail,
  MessageSquare,
  Globe,
  Shield,
  Database,
  AlertTriangle,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState("basic");
  // 注销冷静期配置（D-02：可配置）
  const [cooldownDays, setCooldownDays] = useState(7);
  const [cooldownLoading, setCooldownLoading] = useState(false);
  const [cooldownSaving, setCooldownSaving] = useState(false);
  const [cooldownMessage, setCooldownMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadCooldownConfig = useCallback(async () => {
    try {
      setCooldownLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/account-deletion-config", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setCooldownDays(data.configuredValue ?? data.cooldownDays ?? 7);
      }
    } catch (e) {
      console.warn("加载注销冷静期配置失败:", e);
    } finally {
      setCooldownLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "security") {
      loadCooldownConfig();
    }
  }, [activeTab, loadCooldownConfig]);

  const handleSaveCooldown = async () => {
    const days = Number(cooldownDays);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      setCooldownMessage({ type: "error", text: "天数必须是 1~90 之间的整数" });
      return;
    }
    setCooldownSaving(true);
    setCooldownMessage(null);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/account-deletion-config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ cooldownDays: days }),
      });
      const data = await res.json();
      if (res.ok) {
        setCooldownDays(days);
        setCooldownMessage({ type: "success", text: data.message || "已保存" });
      } else {
        setCooldownMessage({ type: "error", text: data.error || "保存失败" });
      }
    } catch (e) {
      setCooldownMessage({ type: "error", text: "保存失败，请稍后重试" });
    } finally {
      setCooldownSaving(false);
    }
  };

  const settings = {
    basic: {
      siteName: "知阁·舟坊",
      siteUrl: "https://dockyard.zhige.com",
      description: "企业级组件开发与协作平台",
      logo: "/logo.png",
    },
    email: {
      smtpHost: "smtp.zhige.com",
      smtpPort: "587",
      senderEmail: "noreply@zhige.com",
      senderName: "知阁舟坊",
    },
    sms: {
      provider: "aliyun",
      accessKeyId: "LTAI5t****",
      accessKeySecret: "9Xz8****",
      signName: "知阁科技",
    },
  };

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          系统设置
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          全局配置、邮件模板、第三方集成
        </p>
      </div>

      {/* 设置卡片 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

        {/* Tabs */}
        <div className="relative flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("basic")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "basic"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Settings className="w-4 h-4" />
            基础设置
          </button>
          <button
            onClick={() => setActiveTab("email")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "email"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Mail className="w-4 h-4" />
            邮件配置
          </button>
          <button
            onClick={() => setActiveTab("sms")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "sms"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            短信配置
          </button>
          <button
            onClick={() => setActiveTab("oauth")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "oauth"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Globe className="w-4 h-4" />
            第三方登录
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "security"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Shield className="w-4 h-4" />
            安全设置
          </button>
          <button
            onClick={() => setActiveTab("database")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "database"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Database className="w-4 h-4" />
            数据库
          </button>
        </div>

        {/* 内容区域 */}
        <div className="relative p-6 space-y-6">
          {activeTab === "basic" && (
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  网站名称
                </label>
                <input
                  type="text"
                  defaultValue={settings.basic.siteName}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  网站 URL
                </label>
                <input
                  type="url"
                  defaultValue={settings.basic.siteUrl}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  网站描述
                </label>
                <textarea
                  rows={3}
                  defaultValue={settings.basic.description}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Logo URL
                </label>
                <input
                  type="text"
                  defaultValue={settings.basic.logo}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div className="pt-4">
                <button className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  保存设置
                </button>
              </div>
            </div>
          )}

          {activeTab === "email" && (
            <div className="space-y-4 max-w-2xl">
              <div className="relative bg-gradient-to-br from-[#3182ce]/5 to-blue-500/5 rounded-2xl border border-[#3182ce]/10 p-5">
                <p className="text-sm text-slate-600 font-medium">
                  配置 SMTP 邮件服务器，用于发送注册验证码、密码找回等系统邮件。
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  SMTP 服务器
                </label>
                <input
                  type="text"
                  defaultValue={settings.email.smtpHost}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  SMTP 端口
                </label>
                <input
                  type="text"
                  defaultValue={settings.email.smtpPort}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  发件人邮箱
                </label>
                <input
                  type="email"
                  defaultValue={settings.email.senderEmail}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  发件人名称
                </label>
                <input
                  type="text"
                  defaultValue={settings.email.senderName}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div className="pt-4">
                <button className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  保存配置
                </button>
              </div>
            </div>
          )}

          {activeTab === "sms" && (
            <div className="space-y-4 max-w-2xl">
              <div className="relative bg-gradient-to-br from-[#3182ce]/5 to-blue-500/5 rounded-2xl border border-[#3182ce]/10 p-5">
                <p className="text-sm text-slate-600 font-medium">
                  配置短信服务商，用于发送手机验证码、通知短信等。
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  服务商
                </label>
                <select
                  defaultValue={settings.sms.provider}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                >
                  <option value="aliyun">阿里云</option>
                  <option value="tencent">腾讯云</option>
                  <option value="huawei">华为云</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Access Key ID
                </label>
                <input
                  type="text"
                  defaultValue={settings.sms.accessKeyId}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Access Key Secret
                </label>
                <input
                  type="password"
                  defaultValue={settings.sms.accessKeySecret}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  短信签名
                </label>
                <input
                  type="text"
                  defaultValue={settings.sms.signName}
                  className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
                />
              </div>

              <div className="pt-4">
                <button className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
                  保存配置
                </button>
              </div>
            </div>
          )}

          {activeTab === "oauth" && (
            <div className="space-y-4">
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium text-sm">
                  第三方登录配置开发中
                </p>
                <p className="text-sm mt-2">
                  支持微信、QQ、GitHub 等第三方登录
                </p>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-4 max-w-2xl">
              <div className="relative bg-gradient-to-br from-[#3182ce]/5 to-blue-500/5 rounded-2xl border border-[#3182ce]/10 p-5">
                <p className="text-sm text-slate-600 font-medium">
                  配置账号注销安全策略，控制用户注销后进入冷静期的时长。
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 font-medium leading-relaxed">
                    冷静期结束后，账号将被永久注销（逻辑删除 + 匿名化邮箱/手机号 +
                    清空个人配置 + 销毁全部会话），该操作不可恢复。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    注销冷静期天数
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={cooldownDays}
                      disabled={cooldownLoading || cooldownSaving}
                      onChange={(e) => setCooldownDays(Number(e.target.value))}
                      className="w-40 px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-500 font-medium">天</span>
                    {cooldownLoading && (
                      <div className="w-4 h-4 border-2 border-[#63b3ed] border-t-blue-500 rounded-full animate-spin"></div>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-2">
                    范围 1~90 天，默认 7 天。修改后对之后新提交的注销申请生效。
                  </p>
                </div>

                {cooldownMessage && (
                  <p
                    className={`text-sm font-semibold ${
                      cooldownMessage.type === "success"
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {cooldownMessage.text}
                  </p>
                )}

                <div className="pt-2">
                  <button
                    onClick={handleSaveCooldown}
                    disabled={cooldownSaving || cooldownLoading}
                    className="px-6 py-2.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cooldownSaving ? "保存中..." : "保存设置"}
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <p className="text-sm text-slate-500 font-medium">
                  更多安全策略（IP 白名单、访问频率限制等）开发中
                </p>
              </div>
            </div>
          )}

          {activeTab === "database" && (
            <div className="space-y-4">
              <div className="text-center py-12 text-slate-400">
                <Database className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>数据库管理开发中</p>
                <p className="text-sm mt-2">数据备份、恢复、迁移工具</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
