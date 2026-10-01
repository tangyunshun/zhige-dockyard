import { requirePlatformPermission } from "@/lib/security";

/**
 * 满足「任一」权限点即放行。
 * 用于同一操作存在多个合法授权口径的场景，例如「编辑评价」既可由
 * `user_reviews:update`（编辑）也可由 `user_reviews:status_update`（状态流转）授权。
 *
 * 注意：仍然是 fail-closed —— 所有 key 都不通过时返回最后一个拒绝结果。
 */
export async function requireAnyPlatformPermission(
  request: Request,
  permissionKeys: string[]
): Promise<Awaited<ReturnType<typeof requirePlatformPermission>>> {
  let last: Awaited<ReturnType<typeof requirePlatformPermission>> | null = null;

  for (const key of permissionKeys) {
    const result = await requirePlatformPermission(request, key);
    if (result.authorized) return result;
    last = result;
  }

  return (
    last ?? {
      authorized: false,
      errorResponse: new Response(JSON.stringify({ error: "FORBIDDEN" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    }
  );
}
