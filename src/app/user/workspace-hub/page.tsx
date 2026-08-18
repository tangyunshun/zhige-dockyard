import { redirect } from "next/navigation";

// 旧版空间中枢已下线并废弃，重定向到主空间中枢
export default function UserWorkspaceHubPage() {
  redirect("/workspace-hub");
  return null;
}
