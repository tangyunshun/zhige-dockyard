import { redirect } from "next/navigation";

/**
 * 空间升级审批功能已下线：
 * 用户个人空间升级至企业空间已全面走前台自动化开通/购买套餐链路，无需后台人工审核。
 * 历史路由统一自动重定向至工作空间管理 /admin/workspaces。
 */
export default function DeprecatedUpgradeApplicationsPage() {
  redirect("/admin/workspaces");
}
