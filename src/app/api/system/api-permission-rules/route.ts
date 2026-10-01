import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { getApiPermissionRulesStrict } from "@/lib/api-permission-rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/system/api-permission-rules
 * 供统一拦截层（middleware）读取「已启用」的接口权限规则。
 *
 * 自身鉴权（不依赖中间件兜底）：
 *   - 必须携带有效身份凭证（Authorization: Bearer <token> 或登录 Cookie）；
 *   - 未登录 / token 无效 → 401；
 *   - 身份有效后**只**返回已启用规则的 pathPrefix / methods / permission，
 *     不返回管理员名单、权限包明细、目录结构或任何其它平台配置。
 *
 * 为什么不做「按权限点」授权：本接口是拦截层自身的依赖（拦截层用**调用者本人**的 token 调用），
 * 若再要求某个具体权限点，会让没有该权限点的管理员连"被校验"的机会都没有（依赖链断裂）。
 * 因此这里只做**登录级**校验，返回内容本身也仅是非敏感的规则元数据。
 *
 * 防递归：本接口位于 /api/system/**，不在拦截层覆盖范围（/api/admin/**）内，不会被再次拦截。
 */
export async function GET(request: NextRequest) {
  // 1) 自身身份校验：未登录 / 凭证无效一律 401
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { success: false, error: "UNAUTHORIZED" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (error) {
    console.error("[api-permission-rules] 身份校验异常，返回 401:", error);
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  let rules;
  try {
    // 强制读最新：本接口是「保存后立即生效」的关键一环，绝不能吃缓存
    rules = await getApiPermissionRulesStrict();
  } catch (error) {
    // 故障安全：读取失败必须显式报错，**不得伪装成"空规则成功"**（否则中间件会 fail-open 放行）
    console.error("[api-permission-rules] 读取规则失败，返回 503（PERMISSION_RULES_UNAVAILABLE）:", error);
    return NextResponse.json(
      { success: false, error: "PERMISSION_RULES_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  // 注意：此处 rules 为空数组属于"读取成功且确实没有启用规则"，中间件应正常放行
  const enabled = rules
    .filter((r) => r.enabled && r.pathPrefix && r.permission)
    .map((r) => ({
      pathPrefix: r.pathPrefix,
      methods: r.methods ?? [],
      permission: r.permission,
    }));

  return NextResponse.json({ success: true, rules: enabled }, { headers: { "Cache-Control": "no-store" } });
}
