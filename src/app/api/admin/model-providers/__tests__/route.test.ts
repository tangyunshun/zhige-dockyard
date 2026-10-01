import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { PATCH } from "../[id]/route";

/**
 * 供应商名称不可变（平台稳定标识）：
 * modelprovider.name 被 modeldeployment.providerId 与组件执行合同（JSON）引用，
 * 改名无法同步 JSON 合同，会导致「合同 providerId ≠ 注册表 providerId」使真实调用失败。
 * 因此应用层必须拒绝改名，数据库外键也收紧为 ON UPDATE RESTRICT。
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

function patchReq(token: string, body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/admin/model-providers/x", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function fixture() {
  const adminId = "it_mp_u_" + randomUUID();
  const name = "it_mp_p_" + randomUUID();
  await prisma.user.create({ data: { id: adminId, password: "x", role: "SUPER_ADMIN", status: "active" } });
  const provider = await prisma.modelprovider.create({
    data: {
      id: randomUUID(),
      name,
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "MODEL_API_KEY",
      enabled: true,
    },
  });
  const dep = await prisma.modeldeployment.create({
    data: { id: randomUUID(), providerId: name, modelId: "it-mp-model", upstreamModel: "it-mp-model", enabled: true },
  });
  const cleanup = async () => {
    await prisma.modeldeployment.deleteMany({ where: { providerId: name } }).catch(() => {});
    await prisma.modelprovider.deleteMany({ where: { id: provider.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
  };
  return { adminId, name, providerId: provider.id, depId: dep.id, cleanup };
}

describe("供应商名称不可变（稳定标识）", { skip: !process.env.DATABASE_URL }, () => {
  test("改名请求 → 409 PROVIDER_NAME_IMMUTABLE，供应商与部署引用均不变", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const res = await PATCH(patchReq(token, { name: f.name + "-renamed" }), {
        params: Promise.resolve({ id: f.providerId }),
      });
      assert.equal(res.status, 409, `改名必须被拒绝，实际 ${res.status}`);
      const body = await res.json();
      assert.equal(body.code, "PROVIDER_NAME_IMMUTABLE");

      // 供应商名称未变
      const after = await prisma.modelprovider.findUnique({ where: { id: f.providerId }, select: { name: true } });
      assert.equal(after!.name, f.name, "供应商名称不得被修改");
      // 部署的 providerId 未变
      const dep = await prisma.modeldeployment.findUnique({ where: { id: f.depId }, select: { providerId: true } });
      assert.equal(dep!.providerId, f.name, "部署引用不得被改动");
    } finally {
      await f.cleanup();
    }
  });

  test("数据库层兜底：绕过接口直接改 name 也会被外键 RESTRICT 拒绝", async () => {
    const f = await fixture();
    try {
      await assert.rejects(
        () => prisma.modelprovider.update({ where: { id: f.providerId }, data: { name: f.name + "-x" } }),
        (e: unknown) => (e as { code?: string }).code === "P2003" || /foreign key/i.test((e as Error).message),
        "外键 ON UPDATE RESTRICT 必须阻止改名",
      );
      const after = await prisma.modelprovider.findUnique({ where: { id: f.providerId }, select: { name: true } });
      assert.equal(after!.name, f.name);
    } finally {
      await f.cleanup();
    }
  });

  test("同名校验放行：提交原名称 + 其他字段变更可正常保存", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const res = await PATCH(patchReq(token, { name: f.name, enabled: false, sortOrder: 5 }), {
        params: Promise.resolve({ id: f.providerId }),
      });
      assert.equal(res.status, 200, `提交原名称应放行，实际 ${res.status}`);
      const after = await prisma.modelprovider.findUnique({
        where: { id: f.providerId },
        select: { name: true, enabled: true, sortOrder: true },
      });
      assert.equal(after!.name, f.name);
      assert.equal(after!.enabled, false);
      assert.equal(after!.sortOrder, 5);
    } finally {
      await f.cleanup();
    }
  });

  test("C07 合同 providerId 与实际供应商名称保持一致（不得出现新旧并存）", async () => {
    const comp = await prisma.componentcatalog.findUnique({ where: { id: "C07" }, select: { detail: true } });
    const binding = (comp?.detail as Record<string, any> | null)?.executionProfile?.model ?? null;
    assert.ok(binding, "C07 合同必须存在");
    const provider = await prisma.modelprovider.findFirst({ where: { name: binding.defaultProviderId } });
    assert.ok(provider, `合同 providerId=${binding.defaultProviderId} 必须能在 modelprovider.name 中命中`);
    const dep = await prisma.modeldeployment.findFirst({
      where: { providerId: binding.defaultProviderId, modelId: binding.defaultModelId },
    });
    assert.ok(dep, "合同 provider/model 必须对应一个真实部署");
  });
});
