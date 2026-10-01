import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";
import { isSupportedModelProtocol, validateModelBaseUrlForRequest, SUPPORTED_MODEL_PROTOCOLS } from "@/lib/model-endpoint";
import { encryptSecret } from "@/lib/crypto-secrets";
import { withModelRegistryLock, ModelRegistryLockTimeoutError } from "@/lib/model-registry-lock";
import { PLATFORM_DEFAULT_DEPLOYMENT_KEY } from "@/lib/model-registry";

/** PATCH：更新供应商（含启用/禁用开关） */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const exists = await prisma.modelprovider.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ success: false, error: "供应商不存在" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const data: Record<string, unknown> = { updatedAt: new Date() };

    // name 是平台的**稳定标识**（合同 providerId、modeldeployment.providerId 都引用它），禁止改名：
    // 改名无法同步 componentcatalog.detail.executionProfile.providerId / 观测与历史记录，
    // 会导致「合同 providerId ≠ 注册表 providerId」从而使真实调用直接失败。
    if (typeof body.name === "string" && body.name.trim() && body.name.trim() !== exists.name) {
      return NextResponse.json(
        {
          success: false,
          code: "PROVIDER_NAME_IMMUTABLE",
          error:
            "供应商名称是平台的稳定标识（被模型部署与组件执行合同引用），不允许修改。如需更换名称，请新建供应商并迁移部署。",
        },
        { status: 409 },
      );
    }
    if (typeof body.protocol === "string" && body.protocol.trim()) {
      const protocol = body.protocol.trim().toUpperCase();
      if (!isSupportedModelProtocol(protocol)) {
        return NextResponse.json(
          { success: false, error: `暂不支持的对接协议：${protocol}（可选：${SUPPORTED_MODEL_PROTOCOLS.join(" / ")}）` },
          { status: 400 },
        );
      }
      data.protocol = protocol;
    }
    if (typeof body.baseUrl === "string" && body.baseUrl.trim()) {
      // SSRF 防护：复用与创建接口一致的校验
      const endpoint = await validateModelBaseUrlForRequest(body.baseUrl);
      if (!endpoint.ok) {
        return NextResponse.json({ success: false, error: endpoint.error }, { status: 400 });
      }
      data.baseUrl = endpoint.url;
    }
    // apiKeyEnv 可留空（清空为无需密钥）；不传该字段则不改动
    if (typeof body.apiKeyEnv === "string") data.apiKeyEnv = body.apiKeyEnv.trim();
    // apiKey：后台直接录入明文时加密落库；不传则不改动（与 apiKeyEnv 二选一，密文优先）
    if (typeof body.apiKey === "string" && body.apiKey.length > 0) {
      data.apiKeyCipher = encryptSecret(body.apiKey);
    }
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;

    const row = await prisma.modelprovider.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2002") {
      return NextResponse.json({ success: false, error: "供应商名称已存在" }, { status: 409 });
    }
    console.error("[model-provider] 更新失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "更新供应商失败" }, { status: 500 });
  }
}

/** DELETE：删除供应商（存在关联模型部署时拒绝，避免悬挂引用） */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requirePlatformPermission(request, "system:manage", "model:manage");
    if (!auth.authorized) {
      return auth.errorResponse || NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }
    const { id } = await params;
    const exists = await prisma.modelprovider.findUnique({ where: { id } });
    if (!exists) return NextResponse.json({ success: false, error: "供应商不存在" }, { status: 404 });

    // 与删除部署 / 写入空间策略共用同一把模型注册表命名锁：
    // 消除「统计到 0 个部署后、并发创建部署」导致供应商删除留下悬挂部署的竞态。
    // 数据库侧另有 ModelDeployment_providerId_fkey (ON DELETE RESTRICT) 兜底。
    // 注意：providerId 的语义是供应商平台标识 = modelprovider.name。
    const result = await withModelRegistryLock(async (tx) => {
      // 平台默认引用链覆盖：若该供应商下任一部署正是平台默认模型，禁止删除该供应商
      // （与"删除部署"共用同一把命名锁，保证「检查-删除」原子，杜绝悬挂平台默认配置）
      const platformDefault = await tx.systemconfig.findUnique({
        where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY },
      });
      if (platformDefault?.value) {
        const isPlatformDefaultOfProvider = await tx.modeldeployment.count({
          where: { id: platformDefault.value, providerId: exists.name },
        });
        if (isPlatformDefaultOfProvider > 0) {
          return {
            status: 409 as const,
            body: {
              success: false,
              code: "PLATFORM_DEFAULT_DEPLOYMENT_IN_USE",
              error:
                "该供应商下的模型部署正被配置为平台默认模型（system_config.PLATFORM_DEFAULT_DEPLOYMENT_ID），" +
                "请先改选其他平台默认模型或清除该配置后再删除供应商。",
            },
          };
        }
      }

      const count = await tx.modeldeployment.count({ where: { providerId: exists.name } });
      if (count > 0) {
        return {
          status: 409 as const,
          body: {
            success: false,
            error: `该供应商下仍有 ${count} 个模型部署，请先删除或迁移后再删除供应商。`,
          },
        };
      }
      await tx.modelprovider.delete({ where: { id } });
      return { status: 200 as const, body: { success: true } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "P2003") {
      return NextResponse.json(
        { success: false, error: "该供应商下仍有模型部署，请先删除或迁移后再删除供应商。" },
        { status: 409 },
      );
    }
    if (error instanceof ModelRegistryLockTimeoutError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("[model-provider] 删除失败:", (error as Error)?.message);
    return NextResponse.json({ success: false, error: "删除供应商失败" }, { status: 500 });
  }
}
