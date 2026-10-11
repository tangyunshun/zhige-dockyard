import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { setExplicitTestJwtSecret } from "@/lib/jwt-config";
import { saveAdminPermissions } from "@/lib/security";
import { runPermissionKeySync, CATALOG_KEY } from "../../../../../../scripts/sync-permission-keys";
import { POST as syncHandler } from "../sync/route";
import { GET as modelDeploymentsGet } from "@/app/api/admin/model-deployments/route";

const TEST_SECRET = "zhige-super-admin-test-secret-key-at-least-32-chars!";
const JWT_KEY = new TextEncoder().encode(TEST_SECRET);

/** 本批补录的 4 个目标权限点 */
const TARGET_KEYS = ["billing:manage", "billing:read", "model:manage", "model:read"];

function stripKeys(catalog: any[], keysToRemove: string[]) {
  const remove = new Set(keysToRemove);
  return catalog
    .map((g) => ({ ...g, keys: g.keys.filter((k: any) => !remove.has(k.key)) }))
    .filter((g) => g.keys.length > 0);
}

function catalogHasAll(catalog: any[], keys: string[]) {
  const have = new Set(catalog.flatMap((g) => g.keys.map((k: any) => k.key)));
  return keys.every((k) => have.has(k));
}

describe("PERM-CATALOG-UI：权限点代码同步机制（缺失 4 键 → 补齐 → 普通管理员边界 403→200）", () => {
  const superAdminId = `perm-sync-super-${Date.now()}`;
  const regularAdminId = `perm-sync-regular-${Date.now()}`;
  const providerId = `perm-sync-provider-${Date.now()}`;
  const deploymentId = `perm-sync-deploy-${Date.now()}`;

  let superToken: string;
  let regularToken: string;
  let originalCatalogValue: string | null = null;

  before(async () => {
    setExplicitTestJwtSecret(TEST_SECRET);

    // 捕获原始目录，测试结束后还原（避免污染全局状态）
    const original = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
    originalCatalogValue = original?.value ?? null;

    // 1. 制造「目录缺失 4 键」基线：保留现有目录，仅剔除目标 4 键
    const current = original?.value ? JSON.parse(original.value) : [];
    const baseline = stripKeys(current, TARGET_KEYS);
    await prisma.systemconfig.upsert({
      where: { key: CATALOG_KEY },
      create: { key: CATALOG_KEY, value: JSON.stringify(baseline) },
      update: { value: JSON.stringify(baseline) },
    });

    // 2. 超级管理员（用于调用同步接口与审计）
    await prisma.user.create({
      data: {
        id: superAdminId,
        email: `permsync_super_${Date.now()}@zhige.test`,
        name: "PermSync Super",
        role: "SUPER_ADMIN",
        status: "active",
        password: "hash",
      },
    });

    // 3. 普通管理员（PLATFORM_ADMIN，初始无任何细粒度权限 → 走默认拒绝边界）
    await prisma.user.create({
      data: {
        id: regularAdminId,
        email: `permsync_regular_${Date.now()}@zhige.test`,
        name: "PermSync Regular",
        role: "PLATFORM_ADMIN",
        status: "active",
        password: "hash",
      },
    });
    await saveAdminPermissions(regularAdminId, []); // 显式置空权限包

    // 4. 模型部署基数据（让 model-deployments 端点可正常返回 200）
    // 注意：modeldeployment.providerId 外键引用的是 modelprovider.name（见 schema 关系），
    // 故此处 provider 的 name 必须与 deployment 的 providerId 一致，否则 FK 约束失败。
    await prisma.modelprovider.create({
      data: { id: providerId, name: providerId, enabled: true, baseUrl: "https://example.com/v1" },
    });
    await prisma.modeldeployment.create({
      data: {
        id: deploymentId,
        providerId,
        modelId: "perm-sync-model",
        upstreamModel: "perm-sync-model",
        enabled: true,
        capabilities: ["TEXT_GENERATION"],
      },
    });

    superToken = await new SignJWT({ userId: superAdminId, role: "SUPER_ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_KEY);

    regularToken = await new SignJWT({ userId: regularAdminId, role: "PLATFORM_ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_KEY);
  });

  after(async () => {
    setExplicitTestJwtSecret(null);
    // 还原权限目录到测试前状态（只增不删原则：本测试也仅做受控还原）
    if (originalCatalogValue !== null) {
      await prisma.systemconfig.update({ where: { key: CATALOG_KEY }, data: { value: originalCatalogValue } });
    } else {
      await prisma.systemconfig.deleteMany({ where: { key: CATALOG_KEY } });
    }
    await prisma.modeldeployment.deleteMany({ where: { id: deploymentId } });
    await prisma.modelprovider.deleteMany({ where: { id: providerId } });
    await prisma.user.deleteMany({ where: { id: { in: [superAdminId, regularAdminId] } } });
  });

  test("1. 同步前目录确实缺失目标 4 键", async () => {
    const row = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
    const catalog = row?.value ? JSON.parse(row.value) : [];
    assert.ok(!catalogHasAll(catalog, TARGET_KEYS), "基线目录应缺失 billing:*/model:* 4 个权限点");
  });

  test("2. 调用同步接口补齐 4 个权限点（只增不删），并归入账务管理/模型管理两组", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/permissions/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${superToken}` },
    });
    const res = await syncHandler(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.added >= 4, `应至少补录 4 个新权限点，实际 ${json.added}`);
    assert.ok(
      TARGET_KEYS.every((k) => (json.keys || []).includes(k)),
      "补录清单必须包含 billing:manage/read 与 model:manage/read"
    );

    // 数据库目录现在包含 4 个目标键，且新建了「账务管理」「模型管理」两个模块组
    const row = await prisma.systemconfig.findUnique({ where: { key: CATALOG_KEY } });
    const catalog = row?.value ? JSON.parse(row.value) : [];
    assert.ok(catalogHasAll(catalog, TARGET_KEYS), "同步后目录必须包含 4 个目标权限点");
    const groups = catalog.map((g: any) => g.group);
    assert.ok(groups.includes("账务管理"), "应出现「账务管理」模块组");
    assert.ok(groups.includes("模型管理"), "应出现「模型管理」模块组");
  });

  test("3. 直接复用核心同步函数同样补齐 4 键（接口与脚本逻辑同源）", async () => {
    // 注：步骤 2 已将 4 键补齐，此处验证 runPermissionKeySync 幂等——不再重复新增
    const before = await runPermissionKeySync();
    assert.equal(before.added, 0, "已补齐后再次同步不应新增（只增不删，幂等）");
  });

  test("4. 普通管理员边界：未授权 model:read → model-deployments 403；授予后 → 200", async () => {
    const buildReq = (token: string) =>
      new NextRequest("http://localhost:3000/api/admin/model-deployments", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

    // 4.1 未授予 model:read：默认拒绝
    const forbiddenRes = await modelDeploymentsGet(buildReq(regularToken));
    assert.equal(forbiddenRes.status, 403, "普通管理员缺 model:read 应被 403 拒绝");

    // 4.2 模拟「同步后分配」：授予 model:read
    await saveAdminPermissions(regularAdminId, ["model:read"]);

    // 4.3 授予后边界放行
    const okRes = await modelDeploymentsGet(buildReq(regularToken));
    assert.equal(okRes.status, 200, "授予 model:read 后普通管理员应 200 放行");
  });
});
