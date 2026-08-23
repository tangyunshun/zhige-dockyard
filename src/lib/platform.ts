"use client";

import { useDevice } from "@/contexts/DeviceContext";

/**
 * 跨平台能力适配工具
 * 组件导入后结合 useDevice() 即可获得与操作系统匹配的提示与交互策略。
 */

// ---- 复制文本：iOS 旧版 Safari 需要临时选区兜底 ----
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 降级到 execCommand
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// ---- 触发本地下载：移动端用 <a download>，桌面端可用 Blob ----
export function downloadTextFile(filename: string, content: string, mime = "text/markdown") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- 右键菜单 / 长按 触发策略辅助：返回是否是由“右键”触发的事件 ----
export function isContextMenuEvent(e: React.MouseEvent | React.TouchEvent): boolean {
  if ("button" in e) return e.button === 2; // 鼠标右键
  return false;
}

// ---- 组合键提示文本：根据 OS 返回 ⌘/Ctrl 与对应符号 ----
export function usePlatformHints() {
  const { os, isApple, modKeyLabel } = useDevice();
  return {
    os,
    isApple,
    mod: modKeyLabel,
    // 通用组合键展示，如 “⌘ + C” 或 “Ctrl + C”
    combo: (key: string) => `${modKeyLabel} + ${key}`,
    // 触屏设备推荐“长按”作为右键等价的提示语
    contextHint: (label: string) => label,
  };
}
