import { redirect } from "next/navigation";

interface PageProps {
  params: {
    id: string;
  };
  searchParams: {
    stageId?: string;
    [key: string]: string | string[] | undefined;
  };
}

export default function WorkspaceStudioRedirect({ params, searchParams }: PageProps) {
  const workspaceId = params.id;
  const stageId = searchParams.stageId;

  // 拼接目标路由，将旧的 /workspace/[id]/studio 重定向到正确的 /studio?workspaceId=[id]
  let targetUrl = `/studio?workspaceId=${workspaceId}`;
  if (stageId) {
    targetUrl += `&stageId=${stageId}`;
  }

  // 执行服务端重定向
  redirect(targetUrl);
}
