import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { DELETE } from "../[id]/route";

/**
 * 模型部署删除：价格孤儿防护。
 * 验证：同一事务删除 modelpricing + modeldeployment；被空间策略引用时 409 且两表状态一致。
 * 使用临时 provider/deployment/pricing/管理员，测试后清理。
 */
const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function adminToken(uid: string) {
  return new SignJWT({ userId: uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

function delReq(token?: string) {
  return new NextRequest("http://localhost:3000/api/admin/model-deployments/x", {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

async function fixture() {
  const adminId = "it_md_u_" + randomUUID();
  const providerName = "it_md_p_" + randomUUID();
  const depId = randomUUID();
  await prisma.user.create({ data: { id: adminId, password: "x", role: "SUPER_ADMIN", status: "active" } });
  await prisma.modelprovider.create({
    data: {
      id: randomUUID(),
      name: providerName,
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "MODEL_API_KEY",
      enabled: true,
    },
  });
  await prisma.modeldeployment.create({
    data: {
      id: depId,
      providerId: providerName,
      modelId: "it-md-model",
      upstreamModel: "it-md-model",
      enabled: true,
    },
  });
  await prisma.modelpricing.create({
    data: {
      id: randomUUID(),
      deploymentId: depId,
      currency: "CNY",
      costInputMicrosPerMillion: 5_000_000,
      costOutputMicrosPerMillion: 30_000_000,
      priceSource: "VERIFIED",
      priceStatus: "VERIFIED",
      priceVersion: 1,
    },
  });
  const cleanup = async () => {
    await prisma.modelpricing.deleteMany({ where: { deploymentId: depId } }).catch(() => {});
    await prisma.modeldeployment.deleteMany({ where: { id: depId } }).catch(() => {});
    await prisma.modelprovider.deleteMany({ where: { name: providerName } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
  };
  return { adminId, depId, providerName, cleanup };
}

describe("模型部署删除：价格孤儿防护", { skip: !process.env.DATABASE_URL }, () => {
  test("未授权 → 401/403，且不影响任何数据", async () => {
    const f = await fixture();
    try {
      const res = await DELETE(delReq(), { params: Promise.resolve({ id: f.depId }) });
      assert.ok(res.status === 401 || res.status === 403, `未授权应 401/403，实际 ${res.status}`);
      assert.ok(await prisma.modeldeployment.findUnique({ where: { id: f.depId } }));
      assert.ok(await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }));
    } finally {
      await f.cleanup();
    }
  });

  test("删除部署后 modelpricing 不得残留（同事务处理）", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const res = await DELETE(delReq(token), { params: Promise.resolve({ id: f.depId }) });
      assert.equal(res.status, 200, `删除应成功，实际 ${res.status}`);

      assert.equal(
        await prisma.modeldeployment.findUnique({ where: { id: f.depId } }),
        null,
        "部署必须已删除",
      );
      assert.equal(
        await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }),
        null,
        "价格必须随部署一并删除，不得残留价格孤儿",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("被空间策略引用 → 409，部署与价格都保持不变（两表一致）", async () => {
    const f = await fixture();
    const policyId = randomUUID();
    const workspaceId = "it_md_ws_" + randomUUID();
    try {
      await prisma.workspace_model_policy.create({
        data: {
          id: policyId,
          workspaceId,
          defaultDeploymentId: f.depId,
          allowedDeploymentIds: [f.depId],
        },
      });
      const token = await adminToken(f.adminId);
      const res = await DELETE(delReq(token), { params: Promise.resolve({ id: f.depId }) });
      assert.equal(res.status, 409, `被引用应 409，实际 ${res.status}`);

      // 删除失败时两表状态必须保持一致：部署与价格都还在
      assert.ok(await prisma.modeldeployment.findUnique({ where: { id: f.depId } }), "部署不得被删除");
      assert.ok(
        await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }),
        "价格不得被删除（与部署保持一致）",
      );
    } finally {
      await prisma.workspace_model_policy.deleteMany({ where: { id: policyId } }).catch(() => {});
      await f.cleanup();
    }
  });

  test("解除引用后可删除：价格一并清理干净", async () => {
    const f = await fixture();
    const policyId = randomUUID();
    const workspaceId = "it_md_ws2_" + randomUUID();
    try {
      await prisma.workspace_model_policy.create({
        data: { id: policyId, workspaceId, defaultDeploymentId: f.depId, allowedDeploymentIds: [] },
      });
      const token = await adminToken(f.adminId);
      const blocked = await DELETE(delReq(token), { params: Promise.resolve({ id: f.depId }) });
      assert.equal(blocked.status, 409);

      await prisma.workspace_model_policy.update({
        where: { id: policyId },
        data: { defaultDeploymentId: null, allowedDeploymentIds: [] },
      });
      const res = await DELETE(delReq(token), { params: Promise.resolve({ id: f.depId }) });
      assert.equal(res.status, 200, `解除引用后应可删除，实际 ${res.status}`);
      assert.equal(await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }), null);
      assert.equal(await prisma.modeldeployment.findUnique({ where: { id: f.depId } }), null);
    } finally {
      await prisma.workspace_model_policy.deleteMany({ where: { id: policyId } }).catch(() => {});
      await f.cleanup();
    }
  });
});
