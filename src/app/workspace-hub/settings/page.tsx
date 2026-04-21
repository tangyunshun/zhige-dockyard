"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import {
  Settings,
  ArrowLeft,
  Save,
  Cpu,
  Key,
  Database,
  Upload,
  Trash2,
  Download,
  Sparkles,
  Check,
  Github as GithubIcon,
  Gitlab as GitlabIcon,
  AlertTriangle,
  Loader2,
} from "lucide-react";

export default function PersonalWorkspaceSettings() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "overview" | "preferences" | "integrations" | "data"
  >("overview");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // 空间数据
  const [workspaceData, setWorkspaceData] = useState({
    name: "",
    description: "",
    emoji: "🚀",
  });

  // 研发偏好
  const [preferences, setPreferences] = useState({
    aiEngine: "zhige", // zhige | deepseek | custom
    systemPrompt: "",
  });

  // 集成密钥
  const [integrations, setIntegrations] = useState([
    { id: "github", name: "GitHub", icon: GithubIcon, configured: false },
    { id: "gitlab", name: "GitLab", icon: GitlabIcon, configured: false },
  ]);

  // 存储数据
  const [storage, setStorage] = useState({
    used: 45,
    total: 500,
  });

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  const loadWorkspaceData = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login");
        return;
      }
      const data = await res.json();
      const userName = data.user?.name || "用户";
      setWorkspaceData({
        name: `个人空间 - ${userName}`,
        description: "",
        emoji: "🚀",
      });
    } catch (error) {
      console.error("加载工作空间数据失败:", error);
    }
  };

  const handleSaveOverview = async () => {
    if (!workspaceData.name.trim()) {
      toast.error("请输入空间名称");
      return;
    }

    setLoading(true);
    try {
      toast.success("空间配置已保存！");
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    setLoading(true);
    try {
      toast.success("研发偏好已保存！");
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureIntegration = (id: string) => {
    toast.info(`正在配置 ${id === "github" ? "GitHub" : "GitLab"} 集成...`);
  };

  const handleExportData = () => {
    toast.info("正在导出空间数据...");
  };

  const handleClearData = () => {
    toast.error("此操作将清空所有数据，请谨慎操作！");
  };

  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const confirmUpgrade = () => {
    setShowUpgradeModal(false);
    toast.success("已提交升级申请，工作人员将尽快联系您！");
  };

  const tabs = [
    {
      id: "overview" as const,
      label: "空间概览",
      icon: Settings,
    },
    {
      id: "preferences" as const,
      label: "研发偏好",
      icon: Cpu,
    },
    {
      id: "integrations" as const,
      label: "私有集成密钥",
      icon: Key,
    },
    {
      id: "data" as const,
      label: "数据与存储",
      icon: Database,
    },
  ];

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#f0f8ff]">
      {/* 背景：科技感点阵 + 弥散光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        {/* 点阵背景 */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />

        {/* 弥散光晕 */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#3182ce]/[0.08] rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.08] rounded-full blur-[120px]" />
      </div>

      {/* 顶栏 */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="group flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white/60 rounded-lg transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            返回
          </button>
          <Logo variant="light" />
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSaveOverview}
            disabled={loading}
            className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {loading ? "保存中..." : "保存修改"}
          </button>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="relative z-10 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-6xl bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/90 overflow-hidden">
          {/* 头部 */}
          <div className="px-8 py-6 border-b border-[#e2e8f0]/90 bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5">
            <div className="flex items-center gap-4 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
                <Settings className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-800">
                  个人空间设置
                </h1>
                <p className="text-sm text-slate-600">
                  管理您的个人工作空间配置、集成与数据
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* 左侧辅助导航 */}
            <div className="w-full lg:w-64 border-r border-[#e2e8f0]/90 p-6">
              <nav className="space-y-2">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white shadow-lg shadow-[#3182ce]/20"
                          : "text-slate-600 hover:bg-slate-100/80"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      {tab.label}
                    </button>
                  );
                })}

                {/* 升级团队版 */}
                <button
                  onClick={handleUpgrade}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all cursor-pointer bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white shadow-lg shadow-[#8b5cf6]/20 hover:-translate-y-0.5"
                  style={{
                    transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
                  }}
                >
                  <Sparkles className="w-5 h-5" />
                  🚀 升级团队版
                </button>
              </nav>
            </div>

            {/* 右侧内容面板 */}
            <div className="flex-1 p-8">
              {/* 面板 A: 空间概览 */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-[#3182ce]" />
                      空间概览
                    </h2>

                    <div className="space-y-5">
                      {/* 空间 Logo */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-3">
                          空间标识
                        </label>
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center shadow-lg shadow-[#3182ce]/20 text-3xl">
                            {workspaceData.emoji}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const emojis = ["🚀", "💼", "🎨", "", "🔥", "💎", "", "🎯"];
                                const random = emojis[Math.floor(Math.random() * emojis.length)];
                                setWorkspaceData({ ...workspaceData, emoji: random });
                                toast.success("标识已随机更换");
                              }}
                              className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer"
                            >
                              随机 Emoji
                            </button>
                            <button
                              onClick={() => toast.info("上传图标功能开发中...")}
                              className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-[#3182ce] text-[#3182ce] hover:bg-[#3182ce]/5 transition-all cursor-pointer inline-flex items-center gap-2"
                            >
                              <Upload className="w-4 h-4" />
                              上传图标
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 空间名称 */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          空间名称
                        </label>
                        <input
                          type="text"
                          value={workspaceData.name}
                          onChange={(e) =>
                            setWorkspaceData({
                              ...workspaceData,
                              name: e.target.value,
                            })
                          }
                          className="w-full h-[38px] px-[14px] rounded-[8px] text-[14px] border-[1.5px] border-[#e2e8f0] bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none"
                          placeholder="请输入空间名称"
                        />
                      </div>

                      {/* 空间简介 */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          空间简介
                        </label>
                        <textarea
                          value={workspaceData.description}
                          onChange={(e) =>
                            setWorkspaceData({
                              ...workspaceData,
                              description: e.target.value,
                            })
                          }
                          placeholder="简要描述您的个人空间用途（选填）"
                          rows={4}
                          className="w-full px-[14px] py-[12px] rounded-[8px] text-[14px] border-[1.5px] border-[#e2e8f0] bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 面板 B: 研发偏好 */}
              {activeTab === "preferences" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-[#3182ce]" />
                      研发偏好与集成
                    </h2>

                    <div className="space-y-5">
                      {/* 默认 AI 引擎 */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-3">
                          默认 AI 引擎
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {[
                            { id: "zhige", label: "知阁自研引擎", desc: "高性能、低成本" },
                            { id: "deepseek", label: "DeepSeek-V3", desc: "强大推理能力" },
                            { id: "custom", label: "自带 API 密钥", desc: "灵活配置" },
                          ].map((option) => (
                            <button
                              key={option.id}
                              onClick={() =>
                                setPreferences({ ...preferences, aiEngine: option.id })
                              }
                              className={`group relative p-4 rounded-xl border-2 transition-all cursor-pointer text-left ${
                                preferences.aiEngine === option.id
                                  ? "border-[#3182ce] bg-[#3182ce]/5"
                                  : "border-[#e2e8f0] hover:border-[#3182ce]/50"
                              }`}
                              style={{
                                transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    preferences.aiEngine === option.id
                                      ? "border-[#3182ce] bg-[#3182ce]"
                                      : "border-slate-300"
                                  }`}
                                >
                                  {preferences.aiEngine === option.id && (
                                    <Check className="w-3 h-3 text-white" />
                                  )}
                                </div>
                                <span className="text-sm font-bold text-slate-800">
                                  {option.label}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 pl-6">
                                {option.desc}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 全局 System Prompt */}
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          全局 System Prompt
                        </label>
                        <textarea
                          value={preferences.systemPrompt}
                          onChange={(e) =>
                            setPreferences({
                              ...preferences,
                              systemPrompt: e.target.value,
                            })
                          }
                          placeholder="设定该沙盒空间的默认 AI 角色，例如：'你是一位资深的全栈架构师，擅长...'"
                          rows={5}
                          className="w-full px-[14px] py-[12px] rounded-[8px] text-[14px] border-[1.5px] border-[#e2e8f0] bg-white/60 backdrop-blur-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none resize-none"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          此 Prompt 将作为所有 AI 对话的默认系统指令
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 面板 C: 私有集成密钥 */}
              {activeTab === "integrations" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Key className="w-5 h-5 text-[#3182ce]" />
                      私有集成密钥
                    </h2>

                    <div className="space-y-3">
                      {integrations.map((integration) => {
                        const Icon = integration.icon;
                        return (
                          <div
                            key={integration.id}
                            className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80 hover:border-[#3182ce]/50 transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                                <Icon className="w-5 h-5 text-[#3182ce]" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-slate-800">
                                  {integration.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {integration.configured
                                    ? "已配置 Token"
                                    : "未配置"}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => handleConfigureIntegration(integration.id)}
                              className={`h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] transition-all cursor-pointer ${
                                integration.configured
                                  ? "border border-[#10b981] text-[#10b981] hover:bg-[#10b981]/5"
                                  : "bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px]"
                              }`}
                            >
                              {integration.configured ? "重新配置" : "配置 Token"}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-6 p-4 bg-[#3182ce]/5 rounded-xl border border-[#3182ce]/20">
                      <div className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-[#3182ce] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs font-bold text-white">i</span>
                        </div>
                        <div className="text-xs text-[#3182ce] leading-relaxed">
                          <p className="font-bold mb-1">密钥安全说明</p>
                          <p>
                            所有 API 密钥均加密存储于您的个人沙盒中，仅您本人可见。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 面板 D: 数据与存储 */}
              {activeTab === "data" && (
                <div className="space-y-6">
                  {/* 存储条 */}
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                      <Database className="w-5 h-5 text-[#3182ce]" />
                      存储使用情况
                    </h2>

                    <div className="p-6 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold text-slate-700">
                          沙盒容量
                        </span>
                        <span className="text-sm font-bold text-slate-600">
                          {storage.used}MB / {storage.total}MB
                        </span>
                      </div>
                      <div className="relative h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#3182ce] to-[#10b981] rounded-full transition-all duration-500"
                          style={{
                            width: `${(storage.used / storage.total) * 100}%`,
                          }}
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        已使用 {Math.round((storage.used / storage.total) * 100)}%
                        ，剩余 {storage.total - storage.used}MB 可用空间
                      </p>
                    </div>
                  </div>

                  {/* 危险操作区 */}
                  <div>
                    <h2 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      危险操作
                    </h2>

                    <div className="p-6 bg-red-50/50 border border-red-200 rounded-xl">
                      <div className="space-y-3">
                        {/* 导出空间数据 */}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              导出空间数据
                            </p>
                            <p className="text-xs text-slate-500">
                              下载此空间下的所有标书、架构图等测试数据
                            </p>
                          </div>
                          <button
                            onClick={handleExportData}
                            className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-[#3182ce] text-[#3182ce] hover:bg-[#3182ce]/5 transition-all cursor-pointer inline-flex items-center gap-2"
                          >
                            <Download className="w-4 h-4" />
                            导出空间数据
                          </button>
                        </div>

                        {/* 清空沙盒数据 */}
                        <div className="flex items-center justify-between pt-3 border-t border-red-200">
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              清空沙盒数据
                            </p>
                            <p className="text-xs text-slate-500">
                              彻底清除此空间下的所有标书、架构图等测试数据
                            </p>
                          </div>
                          <button
                            onClick={handleClearData}
                            className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-red-500 to-red-600 text-white shadow-[0_2px_6px_-1px_rgba(239,68,68,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(239,68,68,0.4)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer inline-flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            清空沙盒数据
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 升级卡片 */}
                  <div className="mt-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3182ce] via-[#4299e1] to-[#8b5cf6] p-8 text-white">
                    {/* 发光边框效果 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />

                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-4">
                        <Sparkles className="w-8 h-8 text-yellow-300" />
                        <h2 className="text-2xl font-black">
                          将此空间升级为「企业协同版」
                        </h2>
                      </div>

                      <ul className="space-y-2 mb-6">
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="w-5 h-5 text-green-300" />
                          <span>邀请团队成员，解锁多人协作</span>
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="w-5 h-5 text-green-300" />
                          <span>统一算力池分配，集中管理 Token</span>
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                          <Check className="w-5 h-5 text-green-300" />
                          <span>企业级审计日志，追踪所有操作</span>
                        </li>
                      </ul>

                      <button
                        onClick={handleUpgrade}
                        className="h-[42px] px-[24px] rounded-[10px] text-[15px] font-[700] bg-white text-[#3182ce] shadow-lg hover:shadow-xl hover:-translate-y-[2px] transition-all duration-[250ms] cursor-pointer"
                      >
                        立即免费试用企业版
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 升级确认弹窗 */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 遮罩层 */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowUpgradeModal(false)}
          />

          {/* 弹窗内容 */}
          <div className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* 标题栏 */}
            <div className="px-6 py-4 border-b border-[#e2e8f0] bg-gradient-to-r from-[#8b5cf6]/5 to-[#7c3aed]/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#7c3aed] flex items-center justify-center shadow-lg shadow-[#8b5cf6]/20">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">
                    升级为企业协同版
                  </h2>
                  <p className="text-sm text-slate-600">
                    解锁团队协作与全量高阶功能
                  </p>
                </div>
              </div>
            </div>

            {/* 内容区域 */}
            <div className="p-6">
              <div className="space-y-3">
                <p className="text-sm text-slate-700">
                  确认要申请升级此个人空间为企业协同版吗？
                </p>
                <ul className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#10b981]" />
                    <span>15 天免费试用期</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#10b981]" />
                    <span> unlimited 团队成员邀请</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-[#10b981]" />
                    <span>10,000 Token/月 算力额度</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-[#e2e8f0] flex justify-end gap-3">
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-[#e2e8f0] text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={confirmUpgrade}
                className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#8b5cf6] to-[#7c3aed] text-white shadow-[0_2px_6px_-1px_rgba(139,92,246,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(139,92,246,0.4)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer"
              >
                确认申请
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
