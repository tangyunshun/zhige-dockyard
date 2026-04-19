"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { Logo } from "@/components/Logo";
import {
  Settings,
  Palette,
  Bell,
  LogOut,
  Save,
  ArrowLeft,
  Sparkles,
  Monitor,
  Moon,
  Sun,
  Check,
} from "lucide-react";

interface WorkspaceInfo {
  id: string;
  name: string;
  description?: string;
  type: "PERSONAL" | "ENTERPRISE";
}

interface UserInfo {
  id: string;
  name: string;
  avatar?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [activeTab, setActiveTab] = useState<"workspace" | "appearance" | "notification">(
    "workspace"
  );
  const [workspaceData, setWorkspaceData] = useState({
    name: "",
    description: "",
  });
  const [appearanceData, setAppearanceData] = useState({
    theme: "light",
    compactMode: false,
    animations: true,
  });
  const [notificationData, setNotificationData] = useState({
    emailNotifications: true,
    mentionNotifications: true,
    systemAnnouncements: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userRes = await fetch("/api/auth/me");
      if (!userRes.ok) {
        router.push("/auth/login");
        return;
      }
      const userData = await userRes.json();
      setUser(userData.user);

      // 获取当前工作空间信息
      const workspaceRes = await fetch("/api/workspace/list");
      if (workspaceRes.ok) {
        const workspaceData = await workspaceRes.json();
        const personalWorkspace = workspaceData.workspaces.find(
          (w: WorkspaceInfo) => w.type === "PERSONAL"
        );
        if (personalWorkspace) {
          setWorkspace(personalWorkspace);
          setWorkspaceData({
            name: personalWorkspace.name || "",
            description: personalWorkspace.description || "",
          });
        }
      }
    } catch (error) {
      console.error("加载信息失败:", error);
      toast.error("加载信息失败");
    }
  };

  const handleSaveWorkspace = async () => {
    if (!workspaceData.name.trim()) {
      toast.error("请输入空间名称");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/workspace/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace?.id,
          name: workspaceData.name,
          description: workspaceData.description,
        }),
      });

      if (!res.ok) {
        throw new Error("更新失败");
      }

      toast.success("空间设置已更新！");
      loadData();
    } catch (error) {
      console.error("更新空间设置失败:", error);
      toast.error("更新空间设置失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAppearance = async () => {
    setLoading(true);
    try {
      localStorage.setItem("theme", appearanceData.theme);
      localStorage.setItem("compactMode", String(appearanceData.compactMode));
      localStorage.setItem("animations", String(appearanceData.animations));
      toast.success("外观设置已保存！");
    } catch (error) {
      console.error("保存外观设置失败:", error);
      toast.error("保存外观设置失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNotifications = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationData),
      });

      if (!res.ok) {
        throw new Error("更新失败");
      }

      toast.success("通知设置已更新！");
    } catch (error) {
      console.error("更新通知设置失败:", error);
      toast.error("更新通知设置失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        router.push("/");
      } else {
        toast.error("退出登录失败");
      }
    } catch (error) {
      console.error("退出登录失败:", error);
      toast.error("退出登录失败，请稍后重试");
    }
  };

  const tabs = [
    {
      id: "workspace" as const,
      label: "空间设置",
      icon: Settings,
    },
    {
      id: "appearance" as const,
      label: "外观主题",
      icon: Palette,
    },
    {
      id: "notification" as const,
      label: "通知设置",
      icon: Bell,
    },
  ];

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-[#f0f8ff]">
      {/* 背景：科技感点阵 + 弥散光晕 */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #3182ce 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
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
          {user?.avatar && (
            <img
              src={user.avatar}
              alt={user.name || "用户头像"}
              className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm"
            />
          )}
          <button
            onClick={handleLogout}
            className="group flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            退出登录
          </button>
        </div>
      </header>

      {/* 主体内容 */}
      <main className="relative z-10 flex items-start justify-center px-4 py-8">
        <div className="w-full max-w-5xl bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/90 overflow-hidden">
          {/* 头部 */}
          <div className="px-8 py-6 border-b border-[#e2e8f0]/90 bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5">
            <h1 className="text-2xl font-black text-slate-800 mb-2">
              个人空间设置
            </h1>
            <p className="text-sm text-slate-600">
              管理您的个人空间配置、外观主题与通知偏好
            </p>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* 侧边导航 */}
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
              </nav>
            </div>

            {/* 表单区域 */}
            <div className="flex-1 p-8">
              {/* 空间设置 */}
              {activeTab === "workspace" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6">
                      基本信息
                    </h2>

                    <div className="space-y-5">
                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          空间名称
                        </label>
                        <input
                          type="text"
                          value={workspaceData.name}
                          onChange={(e) =>
                            setWorkspaceData({ ...workspaceData, name: e.target.value })
                          }
                          className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95"
                          placeholder="请输入空间名称"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                          空间描述
                        </label>
                        <textarea
                          value={workspaceData.description}
                          onChange={(e) =>
                            setWorkspaceData({ ...workspaceData, description: e.target.value })
                          }
                          placeholder="简要描述您的个人空间用途（选填）"
                          rows={4}
                          className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95 resize-none"
                        />
                      </div>

                      <div className="p-4 bg-[#3182ce]/5 rounded-xl border border-[#3182ce]/20">
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 rounded-full bg-[#3182ce] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-white">i</span>
                          </div>
                          <div className="text-xs text-[#3182ce] leading-relaxed">
                            <p className="font-bold mb-1">温馨提示</p>
                            <p>个人空间名称可随时修改，修改后会同步到空间切换器中。</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleSaveWorkspace}
                        disabled={loading || !workspaceData.name.trim()}
                        className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        {loading ? "保存中..." : "保存修改"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 外观主题 */}
              {activeTab === "appearance" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6">
                      主题设置
                    </h2>

                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => setAppearanceData({ ...appearanceData, theme: "light" })}
                        className={`group relative p-6 rounded-xl border-2 transition-all cursor-pointer ${
                          appearanceData.theme === "light"
                            ? "border-[#3182ce] bg-[#3182ce]/5"
                            : "border-[#e2e8f0] hover:border-[#3182ce]/50"
                        }`}
                      >
                        <div className="aspect-[4/3] bg-white rounded-lg shadow-md mb-3 overflow-hidden">
                          <div className="h-1/3 bg-[#f8fafc] border-b border-[#e2e8f0]" />
                          <div className="p-2">
                            <div className="h-2 bg-[#3182ce]/20 rounded mb-1" />
                            <div className="h-2 bg-[#3182ce]/10 rounded w-2/3" />
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Sun className="w-5 h-5 text-[#f59e0b]" />
                          <p className="text-sm font-bold text-slate-800">浅色模式</p>
                        </div>
                        {appearanceData.theme === "light" && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-[#3182ce] rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>

                      <button
                        onClick={() => setAppearanceData({ ...appearanceData, theme: "dark" })}
                        className={`group relative p-6 rounded-xl border-2 transition-all cursor-pointer ${
                          appearanceData.theme === "dark"
                            ? "border-[#3182ce] bg-[#3182ce]/5"
                            : "border-[#e2e8f0] hover:border-[#3182ce]/50"
                        }`}
                      >
                        <div className="aspect-[4/3] bg-slate-900 rounded-lg shadow-md mb-3 overflow-hidden">
                          <div className="h-1/3 bg-slate-800 border-b border-slate-700" />
                          <div className="p-2">
                            <div className="h-2 bg-[#3182ce]/40 rounded mb-1" />
                            <div className="h-2 bg-[#3182ce]/20 rounded w-2/3" />
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Moon className="w-5 h-5 text-[#6366f1]" />
                          <p className="text-sm font-bold text-slate-800">深色模式</p>
                        </div>
                        {appearanceData.theme === "dark" && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-[#3182ce] rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>

                      <button
                        onClick={() => setAppearanceData({ ...appearanceData, theme: "auto" })}
                        className={`group relative p-6 rounded-xl border-2 transition-all cursor-pointer ${
                          appearanceData.theme === "auto"
                            ? "border-[#3182ce] bg-[#3182ce]/5"
                            : "border-[#e2e8f0] hover:border-[#3182ce]/50"
                        }`}
                      >
                        <div className="aspect-[4/3] bg-gradient-to-br from-white to-slate-900 rounded-lg shadow-md mb-3 overflow-hidden">
                          <div className="h-1/3 bg-gradient-to-r from-[#f8fafc] to-slate-800 border-b border-[#e2e8f0]/50" />
                          <div className="p-2">
                            <div className="h-2 bg-[#3182ce]/30 rounded mb-1" />
                            <div className="h-2 bg-[#3182ce]/15 rounded w-2/3" />
                          </div>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Monitor className="w-5 h-5 text-slate-600" />
                          <p className="text-sm font-bold text-slate-800">跟随系统</p>
                        </div>
                        {appearanceData.theme === "auto" && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-[#3182ce] rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleSaveAppearance}
                        disabled={loading}
                        className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        {loading ? "保存中..." : "保存修改"}
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-[#e2e8f0]/90">
                    <h3 className="text-base font-bold text-slate-800 mb-4">
                      界面偏好
                    </h3>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">紧凑模式</p>
                          <p className="text-xs text-slate-500">减小界面元素间距，显示更多内容</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={appearanceData.compactMode}
                            onChange={(e) =>
                              setAppearanceData({ ...appearanceData, compactMode: e.target.checked })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">动画效果</p>
                          <p className="text-xs text-slate-500">启用物理阻尼动效 (--zg-spring)</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={appearanceData.animations}
                            onChange={(e) =>
                              setAppearanceData({ ...appearanceData, animations: e.target.checked })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 通知设置 */}
              {activeTab === "notification" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6">
                      通知偏好
                    </h2>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">邮件通知</p>
                          <p className="text-xs text-slate-500">通过邮件接收系统通知和更新</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={notificationData.emailNotifications}
                            onChange={(e) =>
                              setNotificationData({ ...notificationData, emailNotifications: e.target.checked })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">@提及通知</p>
                          <p className="text-xs text-slate-500">当有人在评论中@您时发送通知</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={notificationData.mentionNotifications}
                            onChange={(e) =>
                              setNotificationData({ ...notificationData, mentionNotifications: e.target.checked })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">系统公告</p>
                          <p className="text-xs text-slate-500">接收系统维护、功能更新等重要公告</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={notificationData.systemAnnouncements}
                            onChange={(e) =>
                              setNotificationData({ ...notificationData, systemAnnouncements: e.target.checked })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleSaveNotifications}
                        disabled={loading}
                        className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        {loading ? "保存中..." : "保存修改"}
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-[#e2e8f0]/90">
                    <h3 className="text-base font-bold text-slate-800 mb-4">
                      通知管理说明
                    </h3>
                    <div className="p-4 bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5 rounded-xl border border-[#3182ce]/20">
                      <div className="flex items-start gap-3">
                        <Bell className="w-5 h-5 text-[#3182ce] flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-slate-700 leading-relaxed">
                          <p className="font-bold mb-2">通知类型说明</p>
                          <ul className="space-y-1.5 text-xs text-slate-600">
                            <li>• <strong>邮件通知：</strong>重要操作和系统消息会通过邮件发送</li>
                            <li>• <strong>@提及通知：</strong>协作者在评论中提及时会收到提醒</li>
                            <li>• <strong>系统公告：</strong>产品更新、维护通知等全局消息</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
