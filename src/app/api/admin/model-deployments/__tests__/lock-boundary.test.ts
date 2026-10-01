import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { withModelRegistryLock } from "@/lib/model-registry-lock";
import { DELETE as deleteDeployment } from "../[id]/route";
import { PUT as putPolicy } from "@/app/api/admin/workspaces/[id]/model-policy/route";

/**
 * 锁边界确定性回归（**提交边界**）：
 *
 * 目标：证明保护边界覆盖到真实 COMMIT 完成，而不是在 Prisma 回调结束（提交之前）就释放。
 * 手段：手工持锁事务在「已完成数据库写入」后挂起，此时：
 *   a. Worker A 已完成写入但尚未提交；
 *   b. Worker A 不得在提交前释放边界 → Worker B 必须阻塞、不得 settle；
 *   c. Worker B 不得在该窗口写入 allowedDeploymentIds；
 *   d. 最终不得出现指向已删除部署的 JSON 引用。
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

function delReq(token: string, id: string) {
  return new NextRequest(`http://localhost:3000/api/admin/model-deployments/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

function putReq(token: string, workspaceId: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost:3000/api/admin/workspaces/${workspaceId}/model-policy`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function allowedOf(policy: { allowedDeploymentIds: unknown } | null): string[] {
  return policy && Array.isArray(policy.allowedDeploymentIds)
    ? (policy.allowedDeploymentIds as unknown as string[])
    : [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fixture() {
  const adminId = "it_lb_u_" + randomUUID();
  const providerName = "it_lb_p_" + randomUUID();
  const depId = randomUUID();
  const workspaceId = "it_lb_ws_" + randomUUID();

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
    data: { id: depId, providerId: providerName, modelId: "it-lb-model", upstreamModel: "it-lb-model", enabled: true },
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
    data: { id: workspaceId, name: "it-lb", type: "PERSONAL", ownerId: adminId, updatedAt: new Date() },
  });
  await prisma.workspace_model_policy.create({
    data: { id: randomUUID(), workspaceId, defaultDeploymentId: null, allowedDeploymentIds: [] },
  });

  const cleanup = async () => {
    await prisma.workspace_model_policy.deleteMany({ where: { workspaceId } }).catch(() => {});
    await prisma.modelpricing.deleteMany({ where: { deploymentId: depId } }).catch(() => {});
    await prisma.modeldeployment.deleteMany({ where: { id: depId } }).catch(() => {});
    await prisma.modelprovider.deleteMany({ where: { name: providerName } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
  };
  return { adminId, depId, workspaceId, providerName, cleanup };
}

describe("锁边界覆盖真实 COMMIT（不得在提交前释放）", { skip: !process.env.DATABASE_URL }, () => {
  test("A 已写入未提交时：B 不得 settle，也不得写入 allowedDeploymentIds；A 提交后 B 被正确拒绝", async () => {
    const f = await fixture();
    try {
      let signalWritten!: () => void;
      const written = new Promise<void>((r) => {
        signalWritten = r;
      });
      let releaseA!: () => void;
      const gate = new Promise<void>((r) => {
        releaseA = r;
      });

      // Worker A：持锁 → 删除价格与部署（未提交）→ 等待信号 → 提交
      const workerA = withModelRegistryLock(async (tx) => {
        await tx.modelpricing.deleteMany({ where: { deploymentId: f.depId } });
        await tx.modeldeployment.delete({ where: { id: f.depId } });
        signalWritten();
        await gate; // 已完成数据库写入，但**尚未提交**，锁仍由本事务持有
      });

      await written;

      // Worker B：真实策略写入接口（必须阻塞在锁上）
      const token = await adminToken(f.adminId);
      let bSettled = false;
      const workerB = putPolicy(
        putReq(token, f.workspaceId, { defaultDeploymentId: null, allowedDeploymentIds: [f.depId] }),
        { params: Promise.resolve({ workspaceId: f.workspaceId }) },
      ).then((res) => {
        bSettled = true;
        return res;
      });

      // b/c：A 提交前，B 既不能完成，也不能写入任何引用
      await sleep(1200);
      assert.equal(bSettled, false, "Worker A 未提交期间，Worker B 不得完成写入（说明锁在提交前即被释放）");
      const midPolicy = await prisma.workspace_model_policy.findUnique({ where: { workspaceId: f.workspaceId } });
      assert.deepEqual(allowedOf(midPolicy), [], "A 未提交期间不得出现任何白名单写入");

      releaseA!(); // A 提交，行锁由数据库在提交时释放
      const [bRes] = await Promise.all([workerB, workerA]);

      // A 提交后 B 才获得锁：此时部署已被删除，B 必须被拒绝而不是写入无效引用
      assert.equal(bRes.status, 400, `A 提交后应拒绝无效白名单，实际 ${bRes.status}`);
      const finalPolicy = await prisma.workspace_model_policy.findUnique({ where: { workspaceId: f.workspaceId } });
      assert.ok(
        !allowedOf(finalPolicy).includes(f.depId),
        "最终不得出现指向已删除部署的 JSON 引用",
      );
      assert.equal(await prisma.modeldeployment.findUnique({ where: { id: f.depId } }), null, "部署应已删除");
      assert.equal(
        await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }),
        null,
        "价格应随部署一并删除",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("B 已写入策略未提交时：A 的删除必须阻塞，B 提交后 A 被 409 拒绝且部署与价格保持不变", async () => {
    const f = await fixture();
    try {
      let signalWritten!: () => void;
      const written = new Promise<void>((r) => {
        signalWritten = r;
      });
      let releaseB!: () => void;
      const gate = new Promise<void>((r) => {
        releaseB = r;
      });

      // Worker B：持锁 → 写入白名单（未提交）→ 等待信号 → 提交
      const workerB = withModelRegistryLock(async (tx) => {
        await tx.workspace_model_policy.update({
          where: { workspaceId: f.workspaceId },
          data: { allowedDeploymentIds: [f.depId], updatedAt: new Date() },
        });
        signalWritten();
        await gate; // 已写入，未提交
      });

      await written;

      // Worker A：真实删除部署接口（必须阻塞在锁上）
      const token = await adminToken(f.adminId);
      let aSettled = false;
      const workerA = deleteDeployment(delReq(token, f.depId), { params: Promise.resolve({ id: f.depId }) }).then(
        (res) => {
          aSettled = true;
          return res;
        },
      );

      await sleep(1200);
      assert.equal(aSettled, false, "Worker B 未提交期间，删除部署不得完成（说明锁在提交前即被释放）");

      releaseB!();
      const [aRes] = await Promise.all([workerA, workerB]);

      // B 提交后 A 才获得锁：引用已存在 → 必须 409，且两表不变
      assert.equal(aRes.status, 409, `存在引用时必须 409，实际 ${aRes.status}`);
      assert.ok(await prisma.modeldeployment.findUnique({ where: { id: f.depId } }), "部署不得被删除");
      assert.ok(
        await prisma.modelpricing.findUnique({ where: { deploymentId: f.depId } }),
        "价格不得被删除",
      );
      const policy = await prisma.workspace_model_policy.findUnique({ where: { workspaceId: f.workspaceId } });
      assert.deepEqual(allowedOf(policy), [f.depId], "白名单引用应保留且有效");
    } finally {
      await f.cleanup();
    }
  });

  test("锁行为自检：第二次获取必须等到第一次事务 COMMIT 之后", async () => {
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = withModelRegistryLock(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      events.push("A-acquired");
      await gate;
      events.push("A-body-done");
    });
    await sleep(200);
    assert.deepEqual(events, ["A-acquired"]);

    const second = withModelRegistryLock(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      events.push("B-acquired");
    });
    await sleep(600);
    assert.deepEqual(events, ["A-acquired"], "A 未提交时 B 不得获得锁");

    release!();
    await Promise.all([first, second]);
    // B 必须在 A 的事务体结束（=提交前最后一步）之后才拿到锁
    assert.deepEqual(events, ["A-acquired", "A-body-done", "B-acquired"]);
  });
});
