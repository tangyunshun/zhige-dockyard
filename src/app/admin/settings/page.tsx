"use client";

import { useState } from "react";
import {
  Settings,
  Mail,
  MessageSquare,
  Globe,
  Shield,
  Database,
} from "lucide-react";

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState("basic");

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
          全局配置、邮件模板、第三方集成 · 知阁·舟坊
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
            <div className="space-y-4">
              <div className="text-center py-12 text-slate-400">
                <Shield className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>安全设置开发中</p>
                <p className="text-sm mt-2">包含 IP 白名单、访问频率限制等</p>
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
