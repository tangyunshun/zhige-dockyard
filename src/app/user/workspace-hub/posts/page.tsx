import { redirect } from "next/navigation";

// 旧版空间中枢子页面已下线并废弃，重定向到主空间中枢
export default function UserWorkspaceHubPostsPage() {
  redirect("/workspace-hub");
  return null;
}
