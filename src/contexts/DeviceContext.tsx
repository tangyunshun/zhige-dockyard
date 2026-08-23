"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

/** 平台类型 */
export type OS = "windows" | "macos" | "ios" | "android" | "linux" | "unknown";

/** 设备形态：移动端（手机/平板）与桌面端 */
export type DeviceForm = "mobile" | "desktop";

interface DeviceContextType {
  os: OS;
  osLabel: string; // 中文展示名，如 “macOS”
  isMobile: boolean; // 移动形态（含 iOS/Android/触屏小屏）
  isDesktop: boolean; // 桌面形态
  isTouch: boolean; // 触屏设备
  isApple: boolean; // macOS / iOS（快捷键用 ⌘）
  // 跨平台能力提示
  modKeyLabel: string; // “⌘” 或 “Ctrl”
  isMounted: boolean; // 避免 SSR 水合不一致
}

const DeviceContext = createContext<DeviceContextType>({
  os: "unknown",
  osLabel: "未知",
  isMobile: false,
  isDesktop: true,
  isTouch: false,
  isApple: false,
  modKeyLabel: "Ctrl",
  isMounted: false,
});

/** 从 UA 解析操作系统 */
function detectOS(ua: string): OS {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ 在部分 UA 会伪装成 Macintosh，需用触摸能力兜底
  if (/Macintosh|Mac OS X/i.test(ua) && !("ontouchstart" in window)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Android/i.test(ua)) return "android";
  if (/Linux/i.test(ua)) return "linux";
  return "unknown";
}

const OS_LABEL: Record<OS, string> = {
  windows: "Windows",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  linux: "Linux",
  unknown: "未知系统",
};

export const DeviceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<DeviceContextType>({
    os: "unknown",
    osLabel: "未知",
    isMobile: false,
    isDesktop: true,
    isTouch: false,
    isApple: false,
    modKeyLabel: "Ctrl",
    isMounted: false,
  });

  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isTouchDevice =
      typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    let os = detectOS(ua);
    // iPadOS 触摸兜底：Mac UA 但具备触摸能力的，判定为 iOS 平板
    if (os === "macos" && isTouchDevice) os = "ios";

    const isApple = os === "macos" || os === "ios";
    // 移动形态：iOS / Android / 触屏小屏；其余视为桌面
    const isMobileForm = os === "ios" || os === "android" || isTouchDevice;

    setState({
      os,
      osLabel: OS_LABEL[os],
      isMobile: isMobileForm,
      isDesktop: !isMobileForm,
      isTouch: isTouchDevice,
      isApple,
      modKeyLabel: isApple ? "⌘" : "Ctrl",
      isMounted: true,
    });

    // 同步写入 <html> 标记，激活全局跨平台样式层（globals.css 中的 html[data-os] 规则）
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.setAttribute("data-os", os);
      root.setAttribute("data-form", isMobileForm ? "mobile" : "desktop");
      root.setAttribute("data-touch", isTouchDevice ? "true" : "false");
    }
  }, []);

  return <DeviceContext.Provider value={state}>{children}</DeviceContext.Provider>;
};

export const useDevice = () => useContext(DeviceContext);
