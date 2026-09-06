"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import {
  Settings,
  Bell,
  Globe,
  Palette,
  Monitor,
  Smartphone,
  Tablet,
  Check,
  Save,
  Mail,
  FolderGit2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";

export default function UserSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [allowMultiDevice, setAllowMultiDevice] = useState(true);
  const [savingSession, setSavingSession] = useState(false);
  const [settings, setSettings] = useState({
    language: "zh-CN",
    theme: "light",
    notifications: {
      email: true,
      browser: true,
      marketing: false,
    },
    displayDensity: "comfortable",
  });

  // 真实通知与消息推送接收偏好状态（对接数据库 UserNotification）
  const [notificationPref, setNotificationPref] = useState<{
    emailNotifications: boolean;
    systemMessages: boolean;
    projectUpdates: boolean;
    frequency: string;
    hasEmail: boolean;
    userEmail: string;
  }>({
    emailNotifications: true,
    systemMessages: true,
    projectUpdates: true,
    frequency: "REALTIME",
    hasEmail: false,
    userEmail: "",
  });
  const [savingNotificationPref, setSavingNotificationPref] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSessionSettings();
    loadNotificationPref();
  }, []);

  const loadNotificationPref = async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/notifications/preferences", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.ok) {
        const result = await res.json();
        if (result.data) {
          setNotificationPref({
            emailNotifications: result.data.emailNotifications ?? true,
            systemMessages: result.data.systemMessages ?? true,
            projectUpdates: result.data.projectUpdates ?? true,
            frequency: result.data.frequency || "REALTIME",
            hasEmail: Boolean(result.data.user?.hasEmail),
            userEmail: result.data.user?.email || "",
          });
        }
      }
    } catch (error) {
      console.error("Load notification preferences error:", error);
    }
  };

  const saveNotificationPref = async () => {
    setSavingNotificationPref(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/user/notifications/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          emailNotifications: notificationPref.emailNotifications,
          systemMessages: notificationPref.systemMessages,
          projectUpdates: notificationPref.projectUpdates,
          frequency: notificationPref.frequency,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "保存通知偏好失败");
      }
      return true;
    } catch (error) {
      console.error("Save notification preferences error:", error);
      return false;
    } finally {
      setSavingNotificationPref(false);
    }
  };

  const loadSessionSettings = async () => {
    try {
      const res = await fetch("/api/user/session-settings", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setAllowMultiDevice(data.data.allowMultiDevice);
      }
    } catch (error) {
      console.error("Load session settings error:", error);
    }
  };

  const saveSessionSettings = async () => {
    setSavingSession(true);
    try {
      const res = await fetch("/api/user/session-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowMultiDevice }),
      });
      if (res.ok) toast.success("登录策略已保存");
      else toast.error("保存失败，请重试");
    } catch (error) {
      console.error("Save session settings error:", error);
      toast.error("保存失败，请重试");
    } finally {
      setSavingSession(false);
    }
  };

  const loadSettings = async () => {
    try {
      const authToken = getAuthToken();

      const res = await fetch("/api/user/settings", {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setSettings(data.data);
        }
      }
    } catch (error) {
      console.error("Load settings error:", error);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const authToken = getAuthToken();

      const [resSettings, okPref] = await Promise.all([
        fetch("/api/user/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(settings),
        }),
        saveNotificationPref(),
      ]);

      if (resSettings.ok && okPref) {
        toast.success("所有个性化与通知偏好设置已成功保存");
      } else if (resSettings.ok) {
        toast.success("外观偏好已保存（通知偏好保存遇网络波动，请检查）");
      } else {
        toast.error("保存设置失败，请重试");
      }
    } catch (error) {
      console.warn("Save settings error:", error);
      toast.error("保存失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
          偏好设置
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          个性化配置您的使用体验
        </p>
      </div>

      {/* 语言设置 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
            <Globe className="w-5 h-5 text-[#3182ce]" />
            语言设置
          </h2>

          <div className="space-y-3">
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-800">简体中文</p>
                <p className="text-xs text-slate-500">使用简体中文界面</p>
              </div>
              <input
                type="radio"
                name="language"
                value="zh-CN"
                checked={settings.language === "zh-CN"}
                onChange={(e) =>
                  setSettings({ ...settings, language: e.target.value })
                }
                className="w-5 h-5 text-[#3182ce] focus:ring-[#3182ce]"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-800">English</p>
                <p className="text-xs text-slate-500">Use English interface</p>
              </div>
              <input
                type="radio"
                name="language"
                value="en"
                checked={settings.language === "en"}
                onChange={(e) =>
                  setSettings({ ...settings, language: e.target.value })
                }
                className="w-5 h-5 text-[#3182ce] focus:ring-[#3182ce]"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 主题设置 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#f59e0b]/10 to-[#d97706]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#f59e0b] to-[#d97706] rounded-full"></div>
            <Palette className="w-5 h-5 text-[#f59e0b]" />
            主题外观
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setSettings({ ...settings, theme: "light" })}
              className={`p-6 rounded-xl border-2 transition-all ${
                settings.theme === "light"
                  ? "border-[#3182ce] bg-[#3182ce]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Monitor className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-800">浅色模式</p>
              {settings.theme === "light" && (
                <Check className="w-5 h-5 text-[#3182ce] mx-auto mt-2" />
              )}
            </button>

            <button
              onClick={() => setSettings({ ...settings, theme: "dark" })}
              className={`p-6 rounded-xl border-2 transition-all ${
                settings.theme === "dark"
                  ? "border-[#3182ce] bg-[#3182ce]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Monitor className="w-8 h-8 text-slate-800 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-800">深色模式</p>
              {settings.theme === "dark" && (
                <Check className="w-5 h-5 text-[#3182ce] mx-auto mt-2" />
              )}
            </button>

            <button
              onClick={() => setSettings({ ...settings, theme: "auto" })}
              className={`p-6 rounded-xl border-2 transition-all ${
                settings.theme === "auto"
                  ? "border-[#3182ce] bg-[#3182ce]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Monitor className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-800">跟随系统</p>
              {settings.theme === "auto" && (
                <Check className="w-5 h-5 text-[#3182ce] mx-auto mt-2" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 通知与消息推送偏好设置（对接系统真实 UserNotification 数据库） */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
                <Bell className="w-5 h-5 text-[#10b981]" />
                通知与消息订阅偏好
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                自主控制您在知阁平台的消息接收渠道与汇总派发频率，全平台即时生效
              </p>
            </div>
            {notificationPref.hasEmail ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full flex items-center gap-1.5 self-start sm:self-center">
                <Check className="w-3.5 h-3.5" />
                <span>已绑定邮箱: {notificationPref.userEmail}</span>
              </span>
            ) : (
              <Link
                href="/user/profile"
                className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1 rounded-full flex items-center gap-1.5 transition-colors self-start sm:self-center"
                title="前往个人资料设置绑定邮箱"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span>未绑定外部邮箱（点击前往绑定）</span>
                <ExternalLink className="w-3 h-3 text-amber-600" />
              </Link>
            )}
          </div>

          <div className="space-y-4">
            {/* 通道 1：邮件通知 */}
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <span>邮件通知 (Email Alerts)</span>
                    {!notificationPref.hasEmail && (
                      <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        当前无有效邮箱
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {notificationPref.hasEmail
                      ? `通过外部邮箱 (${notificationPref.userEmail}) 接收重要业务变更与安全告警`
                      : "需在个人资料绑定有效邮箱后，邮件通道方可正常送达通知"}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notificationPref.emailNotifications}
                onChange={(e) =>
                  setNotificationPref({
                    ...notificationPref,
                    emailNotifications: e.target.checked,
                  })
                }
                className="w-5 h-5 text-[#10b981] rounded focus:ring-[#10b981] cursor-pointer"
              />
            </label>

            {/* 通道 2：系统消息 */}
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    系统消息 (System Messages)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    站内铃铛未读计数、红点气泡与通知中心消息推送
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notificationPref.systemMessages}
                onChange={(e) =>
                  setNotificationPref({
                    ...notificationPref,
                    systemMessages: e.target.checked,
                  })
                }
                className="w-5 h-5 text-[#10b981] rounded focus:ring-[#10b981] cursor-pointer"
              />
            </label>

            {/* 通道 3：项目更新 */}
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100/80 transition-colors cursor-pointer border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
                  <FolderGit2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    工作空间与项目动态 (Project Updates)
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    所属团队工作空间的成员加入/移除、组件发布与协作动态
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={notificationPref.projectUpdates}
                onChange={(e) =>
                  setNotificationPref({
                    ...notificationPref,
                    projectUpdates: e.target.checked,
                  })
                }
                className="w-5 h-5 text-[#10b981] rounded focus:ring-[#10b981] cursor-pointer"
              />
            </label>

            {/* 汇总投递频率（6 大标准研发协同频率） */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-slate-800 block">
                  消息汇总投递频率 (Notification Frequency)
                </label>
                <span className="text-xs text-slate-500">
                  控制系统向您发送消息汇总的节奏
                </span>
              </div>
              <select
                value={notificationPref.frequency}
                onChange={(e) =>
                  setNotificationPref({
                    ...notificationPref,
                    frequency: e.target.value,
                  })
                }
                className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:border-[#10b981] text-xs font-bold text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#10b981]/20 cursor-pointer"
              >
                <option value="REALTIME">⚡ 实时推送 (REALTIME) - 即刻推送，无任何汇总延迟</option>
                <option value="HOURLY">⏱️ 每小时汇总 (HOURLY) - 紧凑跟踪团队最新变动</option>
                <option value="DAILY">📅 每日汇总 (DAILY) - 每日下班前统一复盘交付</option>
                <option value="WEEKLY">📊 每周精选 (WEEKLY) - 周度工作提炼精选摘要</option>
                <option value="CRITICAL_ONLY">🛡️ 仅严重告警 (CRITICAL_ONLY) - 过滤常规提示，仅派发高危事件</option>
                <option value="QUIET_HOURS">🌙 工作免打扰 (QUIET_HOURS) - 仅在工作时段派发通知</option>
              </select>
            </div>

            {/* 独立快捷保存通知偏好按钮 */}
            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={async () => {
                  const ok = await saveNotificationPref();
                  if (ok) toast.success("通知偏好设置已成功保存并即时生效");
                  else toast.error("保存通知偏好失败，请重试");
                }}
                disabled={savingNotificationPref}
                className="flex items-center gap-1.5 px-5 py-2 bg-[#10b981] hover:bg-[#059669] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingNotificationPref ? "保存偏好中..." : "仅保存通知偏好"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 显示密度 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#8b5cf6]/10 to-[#805ad5]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#8b5cf6] to-[#805ad5] rounded-full"></div>
            显示密度
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => setSettings({ ...settings, displayDensity: "compact" })}
              className={`p-4 rounded-xl border-2 transition-all ${
                settings.displayDensity === "compact"
                  ? "border-[#8b5cf6] bg-[#8b5cf6]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Smartphone className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">紧凑</p>
              <p className="text-xs text-slate-500 mt-1">显示更多内容</p>
            </button>

            <button
              onClick={() => setSettings({ ...settings, displayDensity: "comfortable" })}
              className={`p-4 rounded-xl border-2 transition-all ${
                settings.displayDensity === "comfortable"
                  ? "border-[#8b5cf6] bg-[#8b5cf6]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Tablet className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">舒适</p>
              <p className="text-xs text-slate-500 mt-1">默认间距</p>
            </button>

            <button
              onClick={() => setSettings({ ...settings, displayDensity: "spacious" })}
              className={`p-4 rounded-xl border-2 transition-all ${
                settings.displayDensity === "spacious"
                  ? "border-[#8b5cf6] bg-[#8b5cf6]/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <Monitor className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-800">宽松</p>
              <p className="text-xs text-slate-500 mt-1">更大间距</p>
            </button>
          </div>
        </div>
      </div>

      {/* 登录与设备 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>
        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
            <Smartphone className="w-5 h-5 text-[#10b981]" />
            登录与设备
          </h2>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50">
              <div>
                <p className="text-sm font-bold text-slate-800">允许多设备同时登录</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  开启后可在多台设备同时在线；关闭后仅允许单设备登录，新登录会顶掉其他设备
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAllowMultiDevice((v) => !v)}
                className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
                  allowMultiDevice ? "bg-[#10b981]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                    allowMultiDevice ? "translate-x-5" : ""
                  }`}
                />
              </button>
            </div>
            <div className="flex justify-end">
              <button
                onClick={saveSessionSettings}
                disabled={savingSession}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-[#10b981] to-[#059669] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#10b981]/30 transition-all disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingSession ? "保存中..." : "保存登录策略"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end shrink-0">
        <button
          onClick={saveSettings}
          disabled={loading}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5" />
          {loading ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  );
}
