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
  Shield,
  Smartphone,
  Mail,
  GitFork as GithubIcon,
  MessageCircle as WechatIcon,
  Key,
  Smartphone as Device,
  CreditCard,
  Users,
  Plus,
  AlertTriangle,
  Trash2,
  User,
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
  const [activeTab, setActiveTab] = useState<
    | "profile"
    | "security"
    | "workspace"
    | "appearance"
    | "notification"
    | "billing"
  >("profile");
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

  // 账号安全相关数据
  const [securityData, setSecurityData] = useState({
    phone: "",
    email: "",
    hasPassword: false,
    twoFactorEnabled: false,
  });

  const [workspaces, setWorkspaces] = useState<
    Array<{
      id: string;
      name: string;
      type: "PERSONAL" | "ENTERPRISE";
      role: "OWNER" | "ADMIN" | "MEMBER";
      description?: string;
    }>
  >([]);

  const [billingData, setBillingData] = useState({
    freeTokens: 1000,
    usedTokens: 350,
    plan: "free",
  });

  const [profileData, setProfileData] = useState({
    nickname: "",
    phone: "",
    email: "",
    bio: "",
    title: "",
    avatar: "",
  });

  const [showAvatarSelector, setShowAvatarSelector] = useState(false);

  // 系统内置头像列表（8 个）
  const systemAvatars = [
    "https://api.dicebear.com/7.x/avataaars/svg?seed=1",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=2",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=3",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=4",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=5",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=6",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=7",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=8",
  ];

  // 职位/头衔选项
  const titleOptions = [
    "产品经理",
    "项目经理",
    "技术总监",
    "CTO",
    "CEO",
    "前端工程师",
    "后端工程师",
    "全栈工程师",
    "UI/UX 设计师",
    "数据分析师",
    "运维工程师",
    "测试工程师",
    "架构师",
    "技术顾问",
    "自由职业者",
    "学生",
    "其他",
  ];

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

      // 加载安全数据
      setSecurityData({
        phone: userData.user.phone || "",
        email: userData.user.email || "",
        hasPassword: true, // 假设已设置密码
        twoFactorEnabled: false,
      });

      // 加载个人档案数据
      setProfileData({
        nickname: userData.user.name || "",
        phone: userData.user.phone || "",
        email: userData.user.email || "",
        bio: userData.user.bio || "",
        title: userData.user.title || "",
      });

      // 获取工作空间列表
      const workspaceRes = await fetch("/api/workspace/list");
      if (workspaceRes.ok) {
        const workspaceData = await workspaceRes.json();
        setWorkspaces(workspaceData.workspaces || []);
      }

      // 获取当前工作空间信息
      if (workspaces.length > 0) {
        const personalWorkspace = workspaces.find((w) => w.type === "PERSONAL");
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

  const handleSaveProfile = async () => {
    if (!profileData.nickname.trim()) {
      toast.error("请输入昵称");
      return;
    }

    if (profileData.bio.length > 200) {
      toast.error("个人简介不能超过 200 字");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: profileData.nickname,
          email: profileData.email,
          bio: profileData.bio,
          title: profileData.title,
        }),
      });

      if (!res.ok) {
        throw new Error("更新失败");
      }

      toast.success("个人档案已更新！");
      loadData();
    } catch (error) {
      console.error("更新个人档案失败:", error);
      toast.error("更新个人档案失败，请稍后重试");
    } finally {
      setLoading(false);
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
      id: "profile" as const,
      label: "个人档案",
      icon: Settings,
    },
    {
      id: "security" as const,
      label: "安全与绑定",
      icon: Shield,
    },
    {
      id: "workspace" as const,
      label: "我的工作空间",
      icon: Users,
    },
    {
      id: "appearance" as const,
      label: "偏好与通知",
      icon: Bell,
    },
    {
      id: "billing" as const,
      label: "个人资产",
      icon: CreditCard,
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

      {/* 顶栏 - 更紧凑 */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="group flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-white/60 rounded-lg transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
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

      {/* 主体内容 - 更紧凑的布局 */}
      <main className="relative z-10 flex items-start justify-center px-6 py-6">
        <div className="w-full max-w-7xl bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/90 overflow-hidden">
          {/* 头部 - 更紧凑 */}
          <div className="px-6 py-5 border-b border-[#e2e8f0]/90 bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5">
            <h1 className="text-xl font-black text-slate-800 mb-1">
              个人设置中心
            </h1>
            <p className="text-xs text-slate-600">
              管理您的账号安全、工作空间、偏好设置与个人资产
            </p>
          </div>

          <div className="flex flex-col lg:flex-row">
            {/* 侧边导航 - 更紧凑 */}
            <div className="w-full lg:w-60 border-r border-[#e2e8f0]/90 p-4">
              <nav className="space-y-1.5">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer ${
                        isActive
                          ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white shadow-lg shadow-[#3182ce]/20"
                          : "text-slate-600 hover:bg-slate-100/80"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* 表单区域 - 更紧凑 */}
            <div className="flex-1 p-5">
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
                            setWorkspaceData({
                              ...workspaceData,
                              name: e.target.value,
                            })
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
                            setWorkspaceData({
                              ...workspaceData,
                              description: e.target.value,
                            })
                          }
                          placeholder="简要描述您的个人空间用途（选填）"
                          rows={4}
                          className="w-full px-4 py-2.5 border border-[#e2e8f0] rounded-lg text-sm focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all bg-white/95 resize-none"
                        />
                      </div>

                      <div className="p-4 bg-[#3182ce]/5 rounded-xl border border-[#3182ce]/20">
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 rounded-full bg-[#3182ce] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-white">
                              i
                            </span>
                          </div>
                          <div className="text-xs text-[#3182ce] leading-relaxed">
                            <p className="font-bold mb-1">温馨提示</p>
                            <p>
                              个人空间名称可随时修改，修改后会同步到空间切换器中。
                            </p>
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
                        onClick={() =>
                          setAppearanceData({
                            ...appearanceData,
                            theme: "light",
                          })
                        }
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
                          <p className="text-sm font-bold text-slate-800">
                            浅色模式
                          </p>
                        </div>
                        {appearanceData.theme === "light" && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-[#3182ce] rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>

                      <button
                        onClick={() =>
                          setAppearanceData({
                            ...appearanceData,
                            theme: "dark",
                          })
                        }
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
                          <p className="text-sm font-bold text-slate-800">
                            深色模式
                          </p>
                        </div>
                        {appearanceData.theme === "dark" && (
                          <div className="absolute top-2 right-2 w-6 h-6 bg-[#3182ce] rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>

                      <button
                        onClick={() =>
                          setAppearanceData({
                            ...appearanceData,
                            theme: "auto",
                          })
                        }
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
                          <p className="text-sm font-bold text-slate-800">
                            跟随系统
                          </p>
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
                          <p className="text-sm font-bold text-slate-800">
                            紧凑模式
                          </p>
                          <p className="text-xs text-slate-500">
                            减小界面元素间距，显示更多内容
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={appearanceData.compactMode}
                            onChange={(e) =>
                              setAppearanceData({
                                ...appearanceData,
                                compactMode: e.target.checked,
                              })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            动画效果
                          </p>
                          <p className="text-xs text-slate-500">
                            启用物理阻尼动效 (--zg-spring)
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={appearanceData.animations}
                            onChange={(e) =>
                              setAppearanceData({
                                ...appearanceData,
                                animations: e.target.checked,
                              })
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
                          <p className="text-sm font-bold text-slate-800">
                            邮件通知
                          </p>
                          <p className="text-xs text-slate-500">
                            通过邮件接收系统通知和更新
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={notificationData.emailNotifications}
                            onChange={(e) =>
                              setNotificationData({
                                ...notificationData,
                                emailNotifications: e.target.checked,
                              })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            @提及通知
                          </p>
                          <p className="text-xs text-slate-500">
                            当有人在评论中@您时发送通知
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={notificationData.mentionNotifications}
                            onChange={(e) =>
                              setNotificationData({
                                ...notificationData,
                                mentionNotifications: e.target.checked,
                              })
                            }
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3182ce]"></div>
                        </label>
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            系统公告
                          </p>
                          <p className="text-xs text-slate-500">
                            接收系统维护、功能更新等重要公告
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={notificationData.systemAnnouncements}
                            onChange={(e) =>
                              setNotificationData({
                                ...notificationData,
                                systemAnnouncements: e.target.checked,
                              })
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
                            <li>
                              • <strong>邮件通知：</strong>
                              重要操作和系统消息会通过邮件发送
                            </li>
                            <li>
                              • <strong>@提及通知：</strong>
                              协作者在评论中提及时会收到提醒
                            </li>
                            <li>
                              • <strong>系统公告：</strong>
                              产品更新、维护通知等全局消息
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 个人档案 */}
              {activeTab === "profile" && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 mb-6">
                      基本信息
                    </h2>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          头像
                        </label>
                        <div className="flex items-center gap-4">
                          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center shadow-lg shadow-[#3182ce]/20 overflow-hidden">
                            {profileData.avatar ? (
                              <img
                                src={profileData.avatar}
                                alt="用户头像"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-10 h-10 text-white" />
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowAvatarSelector(true)}
                              className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer"
                            >
                              更换头像
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          支持上传本地图片或选择系统内置头像
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          昵称 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={profileData.nickname}
                          onChange={(e) =>
                            setProfileData({
                              ...profileData,
                              nickname: e.target.value,
                            })
                          }
                          className="w-full h-[38px] px-[14px] rounded-[8px] text-[14px] border-[1.5px] border-[#e2e8f0] bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none"
                          placeholder="请输入昵称"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          职位 / 头衔
                        </label>
                        <select
                          value={profileData.title || ""}
                          onChange={(e) =>
                            setProfileData({
                              ...profileData,
                              title: e.target.value,
                            })
                          }
                          className="w-full h-[38px] px-[14px] rounded-[8px] text-[14px] border-[1.5px] border-[#e2e8f0] bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none cursor-pointer"
                        >
                          <option value="">请选择职位/头衔</option>
                          {titleOptions.map((title) => (
                            <option key={title} value={title}>
                              {title}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1.5">
                          个人简介
                        </label>
                        <textarea
                          value={profileData.bio}
                          onChange={(e) =>
                            setProfileData({
                              ...profileData,
                              bio: e.target.value,
                            })
                          }
                          rows={4}
                          className="w-full px-[14px] py-[12px] rounded-[8px] text-[14px] border-[1.5px] border-[#e2e8f0] bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 transition-all outline-none resize-none"
                          placeholder="介绍一下自己吧..."
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          {profileData.bio.length}/200 字
                        </p>
                      </div>
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={handleSaveProfile}
                        disabled={loading || !profileData.nickname.trim()}
                        className="inline-flex items-center gap-2 h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-4 h-4" />
                        {loading ? "保存中..." : "保存修改"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 安全与绑定 */}
              {activeTab === "security" && (
                <div className="space-y-6">
                  {/* 基础安全区 */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                      基础安全
                    </h2>

                    <div className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                          <Key className="w-5 h-5 text-[#3182ce]" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            登录密码
                          </p>
                          <p className="text-xs text-slate-500">
                            用于账号登录验证
                          </p>
                        </div>
                      </div>
                      <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer">
                        修改密码
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
                          <Shield className="w-5 h-5 text-[#10b981]" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">
                            双重验证 (2FA)
                          </p>
                          <p className="text-xs text-slate-500">
                            额外安全层，保护账号安全
                          </p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={securityData.twoFactorEnabled}
                          onChange={(e) =>
                            setSecurityData({
                              ...securityData,
                              twoFactorEnabled: e.target.checked,
                            })
                          }
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:ring-4 peer-focus:ring-[#3182ce]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#10b981]"></div>
                      </label>
                    </div>
                  </div>

                  {/* 第三方绑定区 */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                      账号绑定
                    </h2>

                    <div className="space-y-3">
                      {/* 手机号 */}
                      <div className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
                            <Smartphone className="w-5 h-5 text-[#f59e0b]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              手机号
                            </p>
                            <p className="text-xs text-slate-500">
                              {securityData.phone
                                ? securityData.phone.replace(
                                    /(\d{3})\d{4}(\d{4})/,
                                    "$1****$2",
                                  )
                                : "未绑定"}
                            </p>
                          </div>
                        </div>
                        <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-[#3182ce] text-[#3182ce] hover:bg-[#3182ce]/5 transition-all cursor-pointer">
                          {securityData.phone ? "更换" : "去绑定"}
                        </button>
                      </div>

                      {/* 邮箱 */}
                      <div className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
                            <Mail className="w-5 h-5 text-[#3182ce]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              邮箱
                            </p>
                            <p className="text-xs text-slate-500">
                              {securityData.email || "未绑定"}
                            </p>
                          </div>
                        </div>
                        <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-[#3182ce] text-[#3182ce] hover:bg-[#3182ce]/5 transition-all cursor-pointer">
                          {securityData.email ? "更换" : "去绑定"}
                        </button>
                      </div>

                      {/* 微信 */}
                      <div className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#07c160]/10 flex items-center justify-center">
                            <WechatIcon className="w-5 h-5 text-[#07c160]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              微信
                            </p>
                            <p className="text-xs text-slate-500">未绑定</p>
                          </div>
                        </div>
                        <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-[#07c160] text-white hover:brightness-110 transition-all cursor-pointer">
                          去绑定
                        </button>
                      </div>

                      {/* GitHub */}
                      <div className="flex items-center justify-between p-4 bg-white/60 rounded-xl border border-[#e2e8f0]/80">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-[#333]/10 flex items-center justify-center">
                            <GithubIcon className="w-5 h-5 text-[#333]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800">
                              GitHub
                            </p>
                            <p className="text-xs text-slate-500">未绑定</p>
                          </div>
                        </div>
                        <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-[#333] text-white hover:brightness-110 transition-all cursor-pointer">
                          去绑定
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 设备与审计 */}
                  <div className="space-y-4">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">
                      最近登录设备
                    </h2>
                    <div className="bg-white/60 rounded-xl border border-[#e2e8f0]/80 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-4 py-3 text-left font-bold text-slate-700">
                              设备类型
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-slate-700">
                              IP 地址
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-slate-700">
                              登录时间
                            </th>
                            <th className="px-4 py-3 text-left font-bold text-slate-700">
                              状态
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-[#e2e8f0]/80">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Device className="w-4 h-4 text-slate-500" />
                                <span>Windows Chrome</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              192.168.1.100
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              2024-01-20 14:30
                            </td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded">
                                当前在线
                              </span>
                            </td>
                          </tr>
                          <tr className="border-t border-[#e2e8f0]/80">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Device className="w-4 h-4 text-slate-500" />
                                <span>Mac Safari</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              192.168.1.101
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              2024-01-19 09:15
                            </td>
                            <td className="px-4 py-3">
                              <button className="text-xs text-[#3182ce] hover:underline cursor-pointer">
                                下线
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end">
                      <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-red-300 text-red-600 hover:bg-red-50 transition-all cursor-pointer">
                        下线其他所有设备
                      </button>
                    </div>
                  </div>

                  {/* 危险区域 */}
                  <div className="p-6 bg-red-50/50 border border-red-200 rounded-xl">
                    <div className="flex items-start gap-3 mb-4">
                      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-base font-bold text-red-800">
                          危险操作
                        </h3>
                        <p className="text-xs text-red-700 mt-1">
                          注销前需确保您名下的企业空间已解散或移交，此操作不可恢复！
                        </p>
                      </div>
                    </div>
                    <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-red-600 text-white hover:bg-red-700 transition-all cursor-pointer flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      注销账号
                    </button>
                  </div>
                </div>
              )}

              {/* 我的工作空间 */}
              {activeTab === "workspace" && (
                <div className="space-y-6">
                  {/* 提示卡片 */}
                  <div className="p-4 bg-[#3182ce]/5 rounded-xl border border-[#3182ce]/20">
                    <p className="text-sm text-[#3182ce]">
                      💡 您可以使用同一个账号，无缝切换并参与多个团队的协作。
                    </p>
                  </div>

                  {/* 工作空间 Grid 卡片列表 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {workspaces.map((workspace) => (
                      <div
                        key={workspace.id}
                        className="group cursor-pointer bg-white/80 backdrop-blur-xl rounded-xl p-5 border border-white/90 hover:shadow-2xl hover:shadow-[#3182ce]/10 transition-all duration-300 hover:-translate-y-1"
                        style={{
                          transitionTimingFunction:
                            "cubic-bezier(0.175, 0.885, 0.32, 1.15)",
                        }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                              workspace.type === "ENTERPRISE"
                                ? "bg-gradient-to-br from-[#f59e0b] to-[#d97706] shadow-[#f59e0b]/20"
                                : "bg-gradient-to-br from-[#3182ce] to-[#2563eb] shadow-[#3182ce]/20"
                            }`}
                          >
                            <Users className="w-6 h-6 text-white" />
                          </div>
                          {workspace.role === "OWNER" && (
                            <span className="px-2 py-1 text-xs font-bold bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white rounded-full shadow-sm">
                              👑 所有者
                            </span>
                          )}
                          {workspace.role === "ADMIN" && (
                            <span className="px-2 py-1 text-xs font-bold bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-full shadow-sm">
                              🛡️ 管理员
                            </span>
                          )}
                          {workspace.role === "MEMBER" && (
                            <span className="px-2 py-1 text-xs font-bold bg-slate-100 text-slate-600 rounded-full">
                              👤 成员
                            </span>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-slate-800 mb-1.5 truncate">
                          {workspace.name}
                        </h3>
                        <p className="text-xs text-slate-500 mb-3 line-clamp-2">
                          {workspace.description || "暂无描述"}
                        </p>

                        <div className="flex items-center gap-2 mb-4">
                          <span
                            className={`px-2 py-1 text-xs font-bold rounded ${
                              workspace.type === "ENTERPRISE"
                                ? "bg-[#f59e0b]/10 text-[#f59e0b]"
                                : "bg-[#3182ce]/10 text-[#3182ce]"
                            }`}
                          >
                            {workspace.type === "ENTERPRISE"
                              ? "企业空间"
                              : "个人空间"}
                          </span>
                        </div>

                        <div className="flex items-center justify-end">
                          {workspace.role === "MEMBER" ? (
                            <button className="h-[36px] px-[16px] rounded-[8px] text-[13px] font-[600] border border-red-300 text-red-600 hover:bg-red-50 transition-all cursor-pointer">
                              退出空间
                            </button>
                          ) : workspace.role === "OWNER" ? (
                            <button className="h-[36px] px-[16px] rounded-[8px] text-[13px] font-[600] border border-[#f59e0b] text-[#f59e0b] hover:bg-[#f59e0b]/5 transition-all cursor-pointer">
                              移交所有权
                            </button>
                          ) : (
                            <button className="h-[36px] px-[16px] rounded-[8px] text-[13px] font-[600] border border-slate-300 text-slate-600 hover:bg-slate-50 transition-all cursor-pointer">
                              管理空间
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* 创建新空间入口 */}
                    <div className="group cursor-pointer bg-white/60 backdrop-blur-xl rounded-xl p-5 border-2 border-dashed border-[#3182ce]/30 hover:border-[#3182ce] hover:bg-[#3182ce]/5 transition-all duration-300 flex items-center justify-center min-h-[180px]">
                      <div className="flex flex-col items-center gap-3 text-[#3182ce]">
                        <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 flex items-center justify-center group-hover:bg-[#3182ce]/20 transition-colors">
                          <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-bold">
                          创建全新的企业工作空间
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 个人资产 */}
              {activeTab === "billing" && (
                <div className="space-y-6">
                  {/* 资产大盘 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-[#3182ce]/5 to-[#10b981]/5 rounded-xl p-6 border border-[#3182ce]/20">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-800">
                          Token 消耗进度
                        </h3>
                        <CreditCard className="w-5 h-5 text-[#3182ce]" />
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="relative w-32 h-32">
                          <svg className="w-full h-full" viewBox="0 0 100 100">
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              fill="none"
                              stroke="#e2e8f0"
                              strokeWidth="12"
                            />
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              fill="none"
                              stroke="url(#gradient)"
                              strokeWidth="12"
                              strokeDasharray={`${(billingData.usedTokens / billingData.freeTokens) * 251.2} 251.2`}
                              strokeLinecap="round"
                              transform="rotate(-90 50 50)"
                            />
                            <defs>
                              <linearGradient
                                id="gradient"
                                x1="0%"
                                y1="0%"
                                x2="100%"
                                y2="0%"
                              >
                                <stop offset="0%" stopColor="#3182ce" />
                                <stop offset="100%" stopColor="#10b981" />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="text-center">
                              <p className="text-2xl font-black text-[#3182ce]">
                                {Math.round(
                                  (billingData.usedTokens /
                                    billingData.freeTokens) *
                                    100,
                                )}
                                %
                              </p>
                              <p className="text-xs text-slate-500">已使用</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1">
                          <div className="mb-3">
                            <p className="text-sm text-slate-600 mb-1">
                              可用 Token
                            </p>
                            <p className="text-3xl font-black text-slate-800">
                              {billingData.freeTokens - billingData.usedTokens}
                            </p>
                          </div>
                          <div className="mb-3">
                            <p className="text-sm text-slate-600 mb-1">
                              总额度
                            </p>
                            <p className="text-xl font-bold text-slate-700">
                              {billingData.freeTokens}
                            </p>
                          </div>
                          <button className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer">
                            升级团队版
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white/80 rounded-xl p-6 border border-[#e2e8f0]/80">
                      <h3 className="text-lg font-bold text-slate-800 mb-4">
                        当前套餐
                      </h3>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center shadow-lg shadow-[#3182ce]/20">
                          <CreditCard className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-xl font-black text-slate-800">
                            免费版
                          </p>
                          <p className="text-xs text-slate-500">
                            适合个人开发者
                          </p>
                        </div>
                      </div>
                      <ul className="space-y-2 text-sm text-slate-600">
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-[#10b981]" />
                          <span>1,000 Token/月</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-[#10b981]" />
                          <span>基础组件库</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-[#10b981]" />
                          <span>个人工作空间</span>
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-[#10b981]" />
                          <span>社区支持</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Token 消耗流水 - 全宽布局 */}
                  <div className="bg-white/80 rounded-xl p-6 border border-[#e2e8f0]/80">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">
                      近期算力消耗流水
                    </h3>
                    <div className="overflow-x-auto">
                      <table
                        className="w-full text-sm"
                        style={{ tableLayout: "auto" }}
                      >
                        <thead>
                          <tr className="border-b-2 border-[#e2e8f0]/80">
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              时间
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              项目
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              类型
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                              Token 消耗
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]/60">
                          <tr className="hover:bg-white/90 transition-colors">
                            <td className="px-4 py-4 text-slate-600 whitespace-nowrap text-xs">
                              2024-01-15 14:32
                            </td>
                            <td className="px-4 py-4 text-slate-800 font-medium whitespace-nowrap text-xs">
                              API 调用 - 文本生成
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#3182ce]/10 text-[#3182ce]">
                                计算任务
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              <span className="text-xs font-bold text-red-600">
                                -150
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-white/90 transition-colors">
                            <td className="px-4 py-4 text-slate-600 whitespace-nowrap text-xs">
                              2024-01-15 10:15
                            </td>
                            <td className="px-4 py-4 text-slate-800 font-medium whitespace-nowrap text-xs">
                              API 调用 - 图像识别
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#3182ce]/10 text-[#3182ce]">
                                计算任务
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              <span className="text-xs font-bold text-red-600">
                                -280
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-white/90 transition-colors">
                            <td className="px-4 py-4 text-slate-600 whitespace-nowrap text-xs">
                              2024-01-14 16:45
                            </td>
                            <td className="px-4 py-4 text-slate-800 font-medium whitespace-nowrap text-xs">
                              月度 Token 充值
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#10b981]/10 text-[#10b981]">
                                系统充值
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              <span className="text-xs font-bold text-green-600">
                                +1000
                              </span>
                            </td>
                          </tr>
                          <tr className="hover:bg-white/90 transition-colors">
                            <td className="px-4 py-4 text-slate-600 whitespace-nowrap text-xs">
                              2024-01-14 09:20
                            </td>
                            <td className="px-4 py-4 text-slate-800 font-medium whitespace-nowrap text-xs">
                              API 调用 - 代码生成
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-[#3182ce]/10 text-[#3182ce]">
                                计算任务
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right whitespace-nowrap">
                              <span className="text-xs font-bold text-red-600">
                                -95
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 头像选择器弹窗 */}
      {showAvatarSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 遮罩层 */}
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setShowAvatarSelector(false)}
          />

          {/* 弹窗内容 */}
          <div className="relative bg-white rounded-2xl w-full max-w-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* 标题栏 */}
            <div className="px-6 py-4 border-b border-[#e2e8f0] bg-gradient-to-r from-[#3182ce]/5 to-[#10b981]/5">
              <h2 className="text-xl font-bold text-slate-800">更换头像</h2>
              <p className="text-sm text-slate-600 mt-1">
                选择系统内置头像或上传本地图片
              </p>
            </div>

            {/* 内容区域 */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {/* 系统内置头像 */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-slate-700 mb-3">
                  系统内置头像
                </h3>
                <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                  {systemAvatars.map((avatar, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setProfileData({ ...profileData, avatar });
                        setShowAvatarSelector(false);
                        toast.success("头像已更新");
                      }}
                      className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-110 cursor-pointer ${
                        profileData.avatar === avatar
                          ? "border-[#3182ce] shadow-lg shadow-[#3182ce]/20"
                          : "border-[#e2e8f0]"
                      }`}
                    >
                      <img
                        src={avatar}
                        alt={`系统头像${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* 上传本地图片 */}
              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-3">
                  上传本地图片
                </h3>
                <div className="border-2 border-dashed border-[#e2e8f0] rounded-xl p-6 text-center hover:border-[#3182ce] transition-colors">
                  <input
                    type="file"
                    id="avatar-upload"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 2 * 1024 * 1024) {
                          toast.error("图片大小不能超过 2MB");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const result = event.target?.result as string;
                          setProfileData({ ...profileData, avatar: result });
                          setShowAvatarSelector(false);
                          toast.success("头像已更新");
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <label
                    htmlFor="avatar-upload"
                    className="cursor-pointer flex flex-col items-center gap-2"
                  >
                    <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                      <User className="w-6 h-6 text-[#3182ce]" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        点击上传头像
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        支持 JPG、PNG 格式，最大 2MB
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-[#e2e8f0] flex justify-end">
              <button
                onClick={() => setShowAvatarSelector(false)}
                className="h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] border border-[#e2e8f0] text-slate-700 hover:bg-slate-50 transition-all cursor-pointer"
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

// 设置页面 - 修复图标导入
