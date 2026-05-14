"use client";

import React, { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
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
} from "lucide-react";

export default function UserSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/settings", {
        headers: { Authorization: `Bearer ${userId}` },
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
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success("设置已保存");
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

      {/* 通知设置 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
            <Bell className="w-5 h-5 text-[#10b981]" />
            通知设置
          </h2>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-800">邮件通知</p>
                <p className="text-xs text-slate-500">
                  接收系统通知和更新到邮箱
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.email}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      email: e.target.checked,
                    },
                  })
                }
                className="w-5 h-5 text-[#10b981] rounded focus:ring-[#10b981]"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-800">浏览器通知</p>
                <p className="text-xs text-slate-500">在浏览器中显示实时通知</p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.browser}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      browser: e.target.checked,
                    },
                  })
                }
                className="w-5 h-5 text-[#10b981] rounded focus:ring-[#10b981]"
              />
            </label>

            <label className="flex items-center justify-between p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
              <div>
                <p className="text-sm font-bold text-slate-800">营销通知</p>
                <p className="text-xs text-slate-500">接收产品更新和优惠信息</p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifications.marketing}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    notifications: {
                      ...settings.notifications,
                      marketing: e.target.checked,
                    },
                  })
                }
                className="w-5 h-5 text-[#10b981] rounded focus:ring-[#10b981]"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 显示密度 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#8b5cf6]/10 to-[#7c3aed]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#8b5cf6] to-[#7c3aed] rounded-full"></div>
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

      {/* 保存按钮 */}
      <div className="flex justify-end shrink-0">
        <button
          onClick={saveSettings}
          disabled={loading}
          className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-[#3182ce]/30 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-5 h-5" />
          {loading ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  );
}
