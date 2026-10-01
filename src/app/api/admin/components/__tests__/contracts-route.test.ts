/**
 * 管理员组件合同 API 路由集成与权限哨兵测试
 *
 * 核心验证：
 * 1. 未授权读写请求被安全拦截 (401/403)；
 * 2. 普通管理员缺少 system:manage 权限时，所有写操作 (POST/PATCH/publish/archive) 均被严格阻断 (403)；
 * 3. 授权超管端到端生命周期：创建草稿 -> 校验 -> 发布 -> 状态锁校验 -> 归档；
 * 4. 发布操作与归档操作生成精确的 operationlog 审计日志；
 * 5. 错误请求返回稳定状态码与错误码，绝不产生脏数据或默认合同。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { POST as createDraftRoute, GET as listContractsRoute } from "../[id]/contracts/route";
import { GET as getContractRoute, PATCH as updateContractRoute } from "../[id]/contracts/[version]/route";
import { POST as publishRoute } from "../[id]/contracts/[version]/publish/route";
import { POST as archiveRoute } from "../[id]/contracts/[version]/archive/route";

const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

/** 生成特定用户的 JWT 凭证 */
async function generateToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

/** 构造 JSON 请求 */
function buildJsonRequest(
  url: string,
  method: string,
  token?: string,
  body?: Record<string, unknown>
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** 标准合法合同草稿模板 */
function createStandardDraft(componentId: string, version: string) {
  return {
    componentId,
    contractVersion: version,
    lifecycle: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    input: {
      kind: "TEXT",
      textConstraints: {
        required: true,
        minLength: 5,
        maxLength: 2000,
      },
    },
    materialPipeline: {
      steps: [{ name: "基础清洗", type: "TEXT_NORMALIZE" }],
    },
    executionPlan: {
      steps: [
        {
          stepId: "step_main",
          name: "文本分析",
          promptTemplateVersion: "v1.0",
          promptTemplate: "业务分析指令: {{sourceText}}",
          inputMapping: { sourceText: "input.text" },
          outputKey: "output_text",
          contextBudgetTokens: 4096,
          maxOutputTokens: 1024,
          timeoutMs: 30000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    },
    output: {
      kind: "DOCUMENT",
      artifactMime: "text/markdown",
      schemaVersion: "1.0",
      rendererType: "MARKDOWN_DOCUMENT",
      previewable: true,
      downloadable: true,
    },
    qualityPolicy: {
      allowAutoRetry: false,
      requireHumanReview: false,
    },
    billingPolicy: {
      mode: "ESTIMATED_COMPATIBILITY",
      estimatedTokens: 800,
    },
  };
}

/** 夹具：创建超管用户、普通管理员用户与测试组件 */
async function setupApiTestFixture() {
  const superAdminId = "super_admin_" + randomUUID().replace(/-/g, "").slice(0, 8);
  const normalAdminId = "normal_admin_" + randomUUID().replace(/-/g, "").slice(0, 8);
  const compId = "API_TEST_C_" + randomUUID().replace(/-/g, "").slice(0, 8);

  // 1. 创建超级管理员（内置 system:manage）
  await prisma.user.create({
    data: {
      id: superAdminId,
      password: "pwd",
      role: "SUPER_ADMIN",
      status: "active",
    },
  });

  // 2. 创建普通管理员（仅有普通角色，无 system:manage 特权）
  await prisma.user.create({
    data: {
      id: normalAdminId,
      password: "pwd",
      role: "PLATFORM_ADMIN",
      status: "active",
    },
  });

  // 3. 创建测试组件
  await prisma.componentcatalog.create({
    data: {
      id: compId,
      name: "API测试专用组件_" + compId,
      description: "用于路由权限与闭环测试",
      category: "BID_PREP",
      icon: "package",
      tags: ["api-test"],
      previewData: {},
    },
  });

  const superToken = await generateToken(superAdminId);
  const normalToken = await generateToken(normalAdminId);

  const cleanup = async () => {
    // 严格外键顺序确定性清理：解除激活外键 -> 审计日志 -> 合同 -> 组件 -> 用户。
    // 清理失败必须让测试失败：禁止空 catch、禁止 .catch(() => {}) 静默吞掉。
    await prisma.componentcatalog.update({
      where: { id: compId },
      data: { activeContractId: null },
    });
    await prisma.operationlog.deleteMany({
      where: { userId: { in: [superAdminId, normalAdminId] } },
    });
    await prisma.componentcontract.deleteMany({
      where: { componentId: compId },
    });
    await prisma.componentcatalog.delete({
      where: { id: compId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [superAdminId, normalAdminId] } },
    });

    // 本轮生成 ID 零残留断言（残留即视为测试失败）
    const residue = {
      contracts: await prisma.componentcontract.count({ where: { componentId: compId } }),
      catalog: await prisma.componentcatalog.count({ where: { id: compId } }),
      logs: await prisma.operationlog.count({ where: { userId: { in: [superAdminId, normalAdminId] } } }),
      users: await prisma.user.count({ where: { id: { in: [superAdminId, normalAdminId] } } }),
    };
    assert.deepEqual(
      residue,
      { contracts: 0, catalog: 0, logs: 0, users: 0 },
      `本轮生成数据必须零残留: ${JSON.stringify(residue)}`,
    );
  };

  return { compId, superAdminId, normalAdminId, superToken, normalToken, cleanup };
}

describe("管理员组件合同 API 路由安全与端到端闭环", () => {
  test("1. 未授权请求被拦截 (401/403)", async () => {
    const f = await setupApiTestFixture();
    try {
      const unauthReq = buildJsonRequest("http://localhost/api/admin/components/x/contracts", "GET");
      const res = await listContractsRoute(unauthReq, { params: Promise.resolve({ id: f.compId }) });
      assert.ok(
        res.status === 401 || res.status === 403,
        `未授权请求必须返回 401 或 403，实际: ${res.status}`
      );
    } finally {
      await f.cleanup();
    }
  });

  test("2. 普通管理员无 system:manage 权限时，所有写操作均被拒绝 (403)", async () => {
    const f = await setupApiTestFixture();
    try {
      const draftPayload = {
        contractVersion: "1.0.0",
        contract: createStandardDraft(f.compId, "1.0.0"),
        description: "草稿尝试",
      };

      // 1. 尝试 POST 创建 DRAFT
      const postReq = buildJsonRequest(
        `http://localhost/api/admin/components/${f.compId}/contracts`,
        "POST",
        f.normalToken,
        draftPayload
      );
      const postRes = await createDraftRoute(postReq, { params: Promise.resolve({ id: f.compId }) });
      assert.equal(postRes.status, 403, `普通管理员创建草稿必须返回 403，实际: ${postRes.status}`);

      // 2. 超管先创建一条草稿
      const adminPostReq = buildJsonRequest(
        `http://localhost/api/admin/components/${f.compId}/contracts`,
        "POST",
        f.superToken,
        draftPayload
      );
      const adminPostRes = await createDraftRoute(adminPostReq, { params: Promise.resolve({ id: f.compId }) });
      assert.equal(adminPostRes.status, 201);

      // 3. 普通管理员尝试 PATCH 修改
      const patchReq = buildJsonRequest(
        `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0`,
        "PATCH",
        f.normalToken,
        { contract: draftPayload.contract, description: "非法修改" }
      );
      const patchRes = await updateContractRoute(patchReq, {
        params: Promise.resolve({ id: f.compId, version: "1.0.0" }),
      });
      assert.equal(patchRes.status, 403, `普通管理员修改草稿必须返回 403，实际: ${patchRes.status}`);

      // 4. 普通管理员尝试 POST publish
      const publishReq = buildJsonRequest(
        `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0/publish`,
        "POST",
        f.normalToken
      );
      const publishRes = await publishRoute(publishReq, {
        params: Promise.resolve({ id: f.compId, version: "1.0.0" }),
      });
      assert.equal(publishRes.status, 403, `普通管理员发布合同必须返回 403，实际: ${publishRes.status}`);

      // 5. 普通管理员尝试 POST archive
      const archiveReq = buildJsonRequest(
        `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0/archive`,
        "POST",
        f.normalToken
      );
      const archiveRes = await archiveRoute(archiveReq, {
        params: Promise.resolve({ id: f.compId, version: "1.0.0" }),
      });
      assert.equal(archiveRes.status, 403, `普通管理员归档合同必须返回 403，实际: ${archiveRes.status}`);
    } finally {
      await f.cleanup();
    }
  });

  test("3. 超管端到端闭环：创建草稿 -> 修改草稿 -> 发布 -> 不可变防篡改 -> 归档", async () => {
    const f = await setupApiTestFixture();
    try {
      const draftObj = createStandardDraft(f.compId, "1.0.0");

      // 1. 创建草稿
      const createRes = await createDraftRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts`,
          "POST",
          f.superToken,
          { contractVersion: "1.0.0", contract: draftObj, description: "初始草稿" }
        ),
        { params: Promise.resolve({ id: f.compId }) }
      );
      assert.equal(createRes.status, 201);
      const createJson = await createRes.json();
      assert.equal(createJson.data.lifecycle, "DRAFT");

      // 2. 修改草稿 (PATCH)
      draftObj.input.textConstraints!.maxLength = 8888;
      const patchRes = await updateContractRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0`,
          "PATCH",
          f.superToken,
          { contract: draftObj, description: "更新后的草稿说明" }
        ),
        { params: Promise.resolve({ id: f.compId, version: "1.0.0" }) }
      );
      assert.equal(patchRes.status, 200);
      const patchJson = await patchRes.json();
      assert.equal(patchJson.data.contract.input.textConstraints.maxLength, 8888);

      // 3. 发布合同 (POST publish)
      const publishRes = await publishRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0/publish`,
          "POST",
          f.superToken
        ),
        { params: Promise.resolve({ id: f.compId, version: "1.0.0" }) }
      );
      assert.equal(publishRes.status, 200);
      const publishJson = await publishRes.json();
      assert.equal(publishJson.data.lifecycle, "PUBLISHED");
      assert.equal(publishJson.data.publishedBy, f.superAdminId);

      // 检查审计日志 operationlog 中是否产生了发布流水
      const publishLog = await prisma.operationlog.findFirst({
        where: {
          userId: f.superAdminId,
          action: "component_contract:publish",
        },
      });
      assert.ok(publishLog, "发布操作必须持久化写入 operationlog 审计日志");

      // 4. 不可变防篡改：发布后再次尝试 PATCH 修改必须返回 409
      const mutateRes = await updateContractRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0`,
          "PATCH",
          f.superToken,
          { contract: draftObj }
        ),
        { params: Promise.resolve({ id: f.compId, version: "1.0.0" }) }
      );
      assert.equal(mutateRes.status, 409, `已发布合同修改必须返回 409，实际: ${mutateRes.status}`);
      const mutateJson = await mutateRes.json();
      assert.equal(mutateJson.code, "CONTRACT_IMMUTABLE");

      // 5. 归档合同 (POST archive)
      // 5.1 当前 1.0.0 正处于组件激活状态，直接归档必须返回 409 ACTIVE_CONTRACT_CANNOT_ARCHIVE
      const blockedArchiveRes = await archiveRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0/archive`,
          "POST",
          f.superToken
        ),
        { params: Promise.resolve({ id: f.compId, version: "1.0.0" }) }
      );
      assert.equal(blockedArchiveRes.status, 409);
      const blockedJson = await blockedArchiveRes.json();
      assert.equal(blockedJson.code, "ACTIVE_CONTRACT_CANNOT_ARCHIVE");

      // 5.2 切换或解绑激活指针后，归档成功 (200)
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: { activeContractId: null },
      });

      const archiveRes = await archiveRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts/1.0.0/archive`,
          "POST",
          f.superToken
        ),
        { params: Promise.resolve({ id: f.compId, version: "1.0.0" }) }
      );
      assert.equal(archiveRes.status, 200);
      const archiveJson = await archiveRes.json();
      assert.equal(archiveJson.data.lifecycle, "ARCHIVED");

      // 检查归档审计日志
      const archiveLog = await prisma.operationlog.findFirst({
        where: {
          userId: f.superAdminId,
          action: "component_contract:archive",
        },
      });
      assert.ok(archiveLog, "归档操作必须写入 operationlog 审计日志");
    } finally {
      await f.cleanup();
    }
  });

  test("4. 尝试在合同中写入模型绑定字段被拒绝 (422)", async () => {
    const f = await setupApiTestFixture();
    try {
      const poisoned = createStandardDraft(f.compId, "1.0.0");
      (poisoned as any).providerId = "openai-forbidden";

      const res = await createDraftRoute(
        buildJsonRequest(
          `http://localhost/api/admin/components/${f.compId}/contracts`,
          "POST",
          f.superToken,
          { contractVersion: "1.0.0", contract: poisoned }
        ),
        { params: Promise.resolve({ id: f.compId }) }
      );
      assert.equal(res.status, 422, `携带模型绑定字段时必须返回 422，实际: ${res.status}`);
      const json = await res.json();
      assert.equal(json.code, "FORBIDDEN_MODEL_BINDING");
    } finally {
      await f.cleanup();
    }
  });
});
