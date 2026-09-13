"use client";

import { useEffect } from "react";
import { getAuthToken } from "@/utils/auth";

/**
 * 全局外观偏好应用器
 *
 * 使「个人工作台 → 偏好设置」中的「主题外观 / 显示密度」真正全局生效：
 *  - 将偏好映射为 <html data-theme> / <html data-density>，由 globals.css 消费；
 *  - 本地缓存优先应用，避免首屏闪烁；
 *  - 随后以服务端偏好为准，并监听保存事件即时生效；
 *  - theme=auto 时跟随系统深浅色并实时响应变化。
 */

export const APPEARANCE_STORAGE_KEY = "zhige_appearance";
export const APPEARANCE_EVENT = "zhige_appearance_updated";

export interface AppearancePrefs {
  theme?: string;
  displayDensity?: string;
}

export function resolveTheme(theme?: string): "light" | "dark" {
  const t = theme || "light";
  if (t === "auto") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  }
  return t === "dark" ? "dark" : "light";
}

export function applyAppearance(prefs: AppearancePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.density = prefs.displayDensity || "comfortable";
  root.dataset.theme = resolveTheme(prefs.theme);
}

export function persistAppearance(prefs: AppearancePrefs) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略隐私模式等写入异常
  }
}

export function readCachedAppearance(): AppearancePrefs | null {
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function PreferencesProvider() {
  useEffect(() => {
    // 1) 先应用本地缓存，避免首屏闪烁
    const cached = readCachedAppearance();
    if (cached) applyAppearance(cached);

    // 2) 再以服务端偏好为准
    const load = async () => {
      try {
        const token = getAuthToken();
        const res = await fetch("/api/user/settings", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (res.ok) {
          const json = await res.json();
          const prefs: AppearancePrefs = json.data || {};
          applyAppearance(prefs);
          persistAppearance(prefs);
        }
      } catch {
        // 未登录 / 接口异常时保持本地缓存外观
      }
    };
    load();

    // 3) 偏好保存后即时生效
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as AppearancePrefs | undefined;
      if (detail) {
        applyAppearance(detail);
        persistAppearance(detail);
      }
    };
    window.addEventListener(APPEARANCE_EVENT, handleUpdate);

    // 4) auto 主题跟随系统深浅色切换
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSchemeChange = () => {
      const cur = readCachedAppearance();
      if (cur && cur.theme === "auto") applyAppearance(cur);
    };
    mq.addEventListener("change", handleSchemeChange);

    return () => {
      window.removeEventListener(APPEARANCE_EVENT, handleUpdate);
      mq.removeEventListener("change", handleSchemeChange);
    };
  }, []);

  return null;
}
