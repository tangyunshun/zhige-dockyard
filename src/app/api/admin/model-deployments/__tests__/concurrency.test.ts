import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { DELETE as deleteDeployment } from "../[id]/route";
import { DELETE as deleteProvider } from "@/app/api/admin/model-providers/[id]/route";
import { PUT as putPolicy } from "@/app/api/admin/workspaces/[id]/model-policy/route";

/**
 * 并发回归：删除模型部署 与 写入空间模型策略 必须互斥。
 *
 * 目标不变量（任何交错下都必须成立）：
 *   1. 空间中不允许出现指向「已删除部署」的策略引用（defaultDeploymentId / allowedDeploymentIds）；
 *   2. 删除与引用写入不得同时成功；
 *   3. 被引用时删除必须 409，且部署与 modelpricing 保持不变。
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

function delReq(token: string, path: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function putReq(token: string, path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fixture() {
  const adminId = "it_cc_u_" + randomUUID();
  const providerName = "it_cc_p_" + randomUUID();
  const depId = randomUUID();
  const workspaceId = "it_cc_ws_" + randomUUID();
  const policyId = randomUUID();

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
    data: { id: depId, providerId: providerName, modelId: "it-cc-model", upstreamModel: "it-cc-model", enabled: true },
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
  await prisma.workspace.create({
    data: { id: workspaceId, name: "it-cc", type: "PERSONAL", ownerId: adminId, updatedAt: new Date() },
  });
  await prisma.workspace_model_policy.create({
    data: { id: policyId, workspaceId, defaultDeploymentId: null, allowedDeploymentIds: [] },
  });

  const cleanup = async () => {
    await prisma.workspace_model_policy.deleteMany({ where: { workspaceId } }).catch(() => {});
    await prisma.modelpricing.deleteMany({ where: { deploymentId: depId } }).catch(() => {});
    await prisma.modeldeployment.deleteMany({ where: { id: depId } }).catch(() => {});
    await prisma.modelprovider.deleteMany({ where: { name: providerName } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
  };
  return { adminId, providerName, depId, workspaceId, policyId, cleanup };
}

describe("并发：删除部署 vs 写入空间策略引用", { skip: !process.env.DATABASE_URL }, () => {
  test("任意交错下都不得留下无效策略引用（重复 8 轮）", async () => {
    for (let round = 0; round < 8; round += 1) {
      const f = await fixture();
      try {
        const token = await adminToken(f.adminId);
        const [delRes, putRes] = await Promise.all([
          deleteDeployment(delReq(token, `/api/admin/model-deployments/${f.depId}`), {
            params: Promise.resolve({ id: f.depId }),
          }),
          putPolicy(
            putReq(token, `/api/admin/workspaces/${f.workspaceId}/model-policy`, {
              defaultDeploymentId: f.depId,
              allowedDeploymentIds: [f.depId],
            }),
            { params: Promise.resolve({ workspaceId: f.workspaceId }) },
          ),
        ]);

        const policy = await prisma.workspace_model_policy.findUnique({ where: { workspaceId: f.workspaceId } });
        const deploymentExists = (await prisma.modeldeployment.findUnique({ where: { id: f.depId } })) !== null;
        const allowed = Array.isArray(policy?.allowedDeploymentIds)
          ? (policy!.allowedDeploymentIds as unknown as string[])
          : [];
        const refsDeployment = policy?.defaultDeploymentId === f.depId || allowed.includes(f.depId);

        // 不变量 1：引用必须指向真实存在的部署
        assert.ok(
          !refsDeployment || deploymentExists,
          `第 ${round + 1} 轮出现无效策略引用（策略引用了已删除的部署）`,
        );
        // 不变量 2：删除与引用写入不得同时成功
        assert.ok(
          !(delRes.status === 200 && putRes.status === 200),
          `第 ${round + 1} 轮删除与引用写入同时成功（del=${delRes.status}, put=${putRes.status}）`,
        );
        // 不变量 3：两者至少有一个是明确的业务结果（200/409/400），不得 500
        for (const [name, res] of [["删除", delRes], ["策略写入", putRes]] as const) {
          assert.notEqual(res.status, 500, `第 ${round + 1} 轮 ${name} 不得返回 500`);
        }

        // 部署被删除时，价格必须同步清理干净
        if (!deploymentExists) {
          assert.equal(
            await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }),
            null,
            "部署已删除时不得残留价格记录",
          );
        }
      } finally {
        await f.cleanup();
      }
    }
  });

  test("已存在引用时删除部署 → 409，且部署与 modelpricing 均保持不变", async () => {
    const f = await fixture();
    try {
      await prisma.workspace_model_policy.update({
        where: { workspaceId: f.workspaceId },
        data: { defaultDeploymentId: f.depId, allowedDeploymentIds: [f.depId] },
      });
      const token = await adminToken(f.adminId);
      const res = await deleteDeployment(delReq(token, `/api/admin/model-deployments/${f.depId}`), {
        params: Promise.resolve({ id: f.depId }),
      });
      assert.equal(res.status, 409, `被引用时应 409，实际 ${res.status}`);
      assert.ok(await prisma.modeldeployment.findUnique({ where: { id: f.depId } }), "部署不得被删除");
      assert.ok(await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }), "价格不得被删除");
    } finally {
      await f.cleanup();
    }
  });

  test("数据库外键兜底：被策略引用的部署无法绕过接口直接删除", async () => {
    const f = await fixture();
    try {
      await prisma.workspace_model_policy.update({
        where: { workspaceId: f.workspaceId },
        data: { defaultDeploymentId: f.depId },
      });
      await assert.rejects(
        () => prisma.modeldeployment.delete({ where: { id: f.depId } }),
        (e: unknown) => (e as { code?: string }).code === "P2003" || /foreign key/i.test((e as Error).message),
        "外键 RESTRICT 必须阻止删除被引用的部署",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("删除供应商：仍有部署 → 409 且不留悬挂部署；清空后删除成功", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const provider = await prisma.modelprovider.findFirst({ where: { name: f.providerName }, select: { id: true } });

      const blocked = await deleteProvider(delReq(token, `/api/admin/model-providers/${provider!.id}`), {
        params: Promise.resolve({ id: provider!.id }),
      });
      assert.equal(blocked.status, 409, `仍有部署时应 409，实际 ${blocked.status}`);
      assert.ok(await prisma.modelprovider.findUnique({ where: { id: provider!.id } }), "供应商不得被删除");

      // 外键兜底：绕过接口直接删除供应商也必须失败
      await assert.rejects(
        () => prisma.modelprovider.delete({ where: { id: provider!.id } }),
        (e: unknown) => (e as { code?: string }).code === "P2003" || /foreign key/i.test((e as Error).message),
        "外键 RESTRICT 必须阻止删除仍有部署的供应商",
      );

      // 清理部署后即可删除供应商，且不残留任何指向它的部署
      await prisma.modelpricing.deleteMany({ where: { deploymentId: f.depId } });
      await prisma.modeldeployment.delete({ where: { id: f.depId } });
      const okRes = await deleteProvider(delReq(token, `/api/admin/model-providers/${provider!.id}`), {
        params: Promise.resolve({ id: provider!.id }),
      });
      assert.equal(okRes.status, 200, `无部署后应删除成功，实际 ${okRes.status}`);
      assert.equal(
        await prisma.modeldeployment.count({ where: { providerId: f.providerName } }),
        0,
        "不得残留悬挂部署",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("并发：删除供应商 vs 写入引用该供应商部署的策略 → 不得出现悬挂部署", async () => {
    for (let round = 0; round < 6; round += 1) {
      const f = await fixture();
      try {
        const token = await adminToken(f.adminId);
        const provider = await prisma.modelprovider.findFirst({ where: { name: f.providerName }, select: { id: true } });
        await Promise.all([
          deleteProvider(delReq(token, `/api/admin/model-providers/${provider!.id}`), {
            params: Promise.resolve({ id: provider!.id }),
          }),
          putPolicy(
            putReq(token, `/api/admin/workspaces/${f.workspaceId}/model-policy`, {
              defaultDeploymentId: f.depId,
              allowedDeploymentIds: [f.depId],
            }),
            { params: Promise.resolve({ workspaceId: f.workspaceId }) },
          ),
        ]);

        // 不变量：只要部署还存在，其 providerId 必须能匹配到供应商（不得悬挂）
        const dep = await prisma.modeldeployment.findUnique({ where: { id: f.depId } });
        if (dep) {
          const provider = await prisma.modelprovider.findFirst({ where: { name: dep.providerId } });
          assert.ok(provider, `第 ${round + 1} 轮出现悬挂部署（providerId=${dep.providerId} 无对应供应商）`);
        }
      } finally {
        await f.cleanup();
      }
    }
  });
});
