"use client";

import { useState } from "react";
import {
  Package,
  Terminal,
  Braces,
  Cloud,
  Boxes,
  Cpu,
  Workflow,
} from "lucide-react";
// 组件目录（componentcatalog.icon）的权威图标映射，与前台组件集市完全一致，避免两套词表分叉
import { iconMap as CATALOG_ICON_MAP } from "@/components/ComponentShowcase";

/**
 * 后台「组件管理」自建组件时使用的图标键（AVAILABLE_ICONS），
 * 与组件目录种子数据（seed-components 的 kebab-case 键）合并，保证两种来源都能正确渲染。
 */
const ADMIN_CREATED_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  package: Package,
  terminal: Terminal,
  braces: Braces,
  cloud: Cloud,
  boxes: Boxes,
  cpu: Cpu,
  workflow: Workflow,
};

const COMPONENT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  ...ADMIN_CREATED_ICONS,
  ...CATALOG_ICON_MAP,
};

/** 按图标 key 取 lucide 图标组件（兼容 "Zap" 这类首字母大写的历史值）；未知 key 回退到组件包图标 */
export function getComponentIconComponent(
  iconName?: string | null,
): React.ComponentType<{ className?: string }> {
  const key = (iconName || "").trim().toLowerCase();
  return COMPONENT_ICON_MAP[key] || Package;
}

const IMAGE_URL_PATTERN = /^(https?:)?\/\//i;

/**
 * 组件图标渲染：数据库存的是图标 key（如 package / shield / bar-chart），
 * 同时兼容历史遗留的图片 URL 字段；图片加载失败时自动回退为图标，避免出现裂图。
 */
export function ComponentIcon({
  icon,
  name,
  className = "w-5 h-5 text-white",
  imgClassName = "w-6 h-6 object-cover rounded",
}: {
  icon?: string | null;
  name?: string | null;
  className?: string;
  imgClassName?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const raw = (icon || "").trim();
  const isImageUrl =
    IMAGE_URL_PATTERN.test(raw) || raw.startsWith("/") || raw.startsWith("data:");

  if (isImageUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={raw}
        alt={name || "组件图标"}
        className={imgClassName}
        onError={() => setImgFailed(true)}
      />
    );
  }

  const IconComp = getComponentIconComponent(raw);
  return <IconComp className={className} />;
}
