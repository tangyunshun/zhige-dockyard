"use client";

/**
 * 岗位图标渲染（lucide 商务图标）
 * 可选图标集合由数据库 posticonlibrary 决定（/api/user/workspace-hub/post-icons），
 * 本文件仅维护「图标名 -> lucide 组件」的渲染白名单，不承载任何岗位业务数据。
 */
import {
  Award,
  BadgeCheck,
  Banknote,
  BookOpenCheck,
  Boxes,
  Braces,
  Briefcase,
  BriefcaseBusiness,
  Bug,
  Building2,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Crown,
  Database,
  DollarSign,
  Eye,
  Factory,
  FileSearch,
  FileText,
  FlaskConical,
  FolderKanban,
  Gavel,
  GitBranch,
  HardHat,
  KeyRound,
  Landmark,
  Lock,
  MessagesSquare,
  Package,
  PenTool,
  Receipt,
  Settings2,
  ShieldCheck,
  Target,
  Truck,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** 岗位图标名 -> lucide 组件白名单（与 posticonlibrary 表保持同一套图标名） */
export const POST_ICON_MAP: Record<string, LucideIcon> = {
  Crown,
  UserCog,
  ShieldCheck,
  KeyRound,
  BadgeCheck,
  Users,
  UserPlus,
  UserRound,
  MessagesSquare,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Landmark,
  Target,
  Award,
  DollarSign,
  Wallet,
  Banknote,
  Receipt,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  Package,
  Truck,
  PenTool,
  FolderKanban,
  HardHat,
  Factory,
  Database,
  GitBranch,
  Braces,
  Bug,
  Settings2,
  Wrench,
  Eye,
  FileSearch,
  Gavel,
  Lock,
  BookOpenCheck,
  ChartColumn,
  Boxes,
  FileText,
  FlaskConical,
};

/** 岗位图标兜底 key（库中缺失元数据时使用的默认商务图标） */
export const DEFAULT_POST_ICON = "UserRound";

/** 校验字符串是否为受支持的岗位图标名（避免任意字符/emoji 落入数据） */
export function isValidPostIcon(iconKey?: string | null): iconKey is string {
  return !!iconKey && iconKey in POST_ICON_MAP;
}

/** 岗位图标展示组件：传入数据库图标名（iconKey），未知时回退默认图标 */
export function PostIcon({
  iconKey,
  className,
}: {
  iconKey?: string | null;
  className?: string;
}) {
  const IconComp = POST_ICON_MAP[iconKey || ""] || POST_ICON_MAP[DEFAULT_POST_ICON];
  return <IconComp className={className || "w-4 h-4"} />;
}
