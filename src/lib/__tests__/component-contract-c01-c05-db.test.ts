/**
 * C01-C05 真实合同「数据库 + 生产路由」验收测试
 *
 * 覆盖迁移批次验收要求：
 *  2. PUBLISHED / 激活状态测试（可激活组件真实发布并激活，catalog.contractReady=true）；
 *  3. 输入不符合合同的拒绝测试（路由层 400 拒绝）；
 *  5. 模型能力不匹配时拒绝测试（C01/C03 需要 STRUCTURED_OUTPUT → 路由 403，不扣点、不写任务）；
 *  6. 失败时不产生错误扣费（能力拒绝路径无 CONSUME 流水）；
 *  7. 合同快照不可变（激活后合同内容不被改写）；
 *  8. 前端 contractReady 状态来自数据库 API（catalog 返回 contractReady / activeContractLifecycle）。
 *
 * 说明：全部使用**临时组件/用户/空间**承载真实 C01-C05 合同结构，
 * 测试结束在 finally 中严格清理；清理失败会使测试失败。绝不写入真实 C01-C05 组件行。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { POST as studioPostRoute, GET as studioGetRoute } from "@/app/api/studio/route";
import {
  createDraftContract,
  publishContract,
  updateDraftContract,
  getImmutableContractSnapshot,
} from "@/lib/component-contract/repository";
import { C01_C05_BATCH, evaluateActivationEligibility } from "@/lib/component-contract/catalog-contracts-c01-c05";
import type { ComponentContract } from "@/lib/component-contract/types";

const JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

function jsonReq(url: string, tokenValue: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenValue}` },
    body: JSON.stringify(body),
  });
}

/** 构造 multipart/form-data 请求（文件类组件必须提供真实上传文件才能越过输入校验） */
function multipartReq(
  url: string,
  tokenValue: string,
  fields: Record<string, string>,
  files: Array<{ name: string; content: string | Uint8Array; mimeType: string }>,
): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const file of files) form.append("file", new Blob([file.content as BlobPart], { type: file.mimeType }), file.name);
  return new NextRequest(url, { method: "POST", headers: { Authorization: `Bearer ${tokenValue}` }, body: form });
}

/** 临时夹具：超级管理员用户 + 个人空间 + 临时组件（承载真实合同结构） */
async function setupFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const adminId = `u_c05m_${suffix}`;
  const userId = `u_c05u_${suffix}`;
  const workspaceId = `ws_c05_${suffix}`;
  const compId = `C_TMP_${suffix}`;
  const balance = BigInt(100000);

  await prisma.user.create({ data: { id: adminId, password: "t", role: "SUPER_ADMIN", status: "active" } });
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `C01C05_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${suffix}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${suffix}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${suffix}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${suffix}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  await prisma.componentcatalog.create({
    data: {
      id: compId, name: `迁移验收组件_${suffix}`, description: "C01-C05 合同迁移验收", category: "BID_PREP",
      icon: "Cpu", tags: ["c01c05-migration"], estimatedModelTokens: 50, previewData: {}, isPublished: true,
    },
  });

  const adminToken = await token(adminId);
  const userToken = await token(userId);

  const cleanup = async () => {
    await prisma.pointledger.deleteMany({ where: { userId } });
    await prisma.pointgrant.deleteMany({ where: { userId } });
    await prisma.userwallet.deleteMany({ where: { userId } });
    await prisma.componenttask.deleteMany({ where: { userId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.operationlog.deleteMany({ where: { userId: { in: [adminId, userId] } } });
    // 必须先解除 activeContractId 外键引用，才能删除合同（否则外键冲突）
    await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: null } });
    await prisma.componentcontract.deleteMany({ where: { componentId: compId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.componentcatalog.delete({ where: { id: compId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });
  };

  return { adminId, userId, workspaceId, compId, adminToken, userToken, cleanup };
}

const byId = Object.fromEntries(C01_C05_BATCH.map((b) => [b.componentId, b.contract])) as Record<string, ComponentContract>;

/** 以真实合同结构创建临时组件的草稿并发布 */
async function publishTempContract(f: Awaited<ReturnType<typeof setupFixture>>, source: ComponentContract) {
  const contract: ComponentContract = { ...source, componentId: f.compId };
  await createDraftContract({ componentId: f.compId, contractVersion: source.contractVersion, contract });
  // 显式不自动激活：能力不匹配的组件必须保持未激活（待配置）
  await publishContract({ componentId: f.compId, contractVersion: source.contractVersion, publishedBy: f.adminId, autoActivate: false });
}

describe("C01-C05 真实合同数据库验收", () => {
  test("1. C01-C05 全部可发布并激活：catalog 诚实返回 contractReady=true / activeContractLifecycle=PUBLISHED", async () => {
    for (const id of ["C01", "C02", "C03", "C04", "C05"]) {
      const f = await setupFixture();
      try {
        // 能力裁决：平台默认部署已具备 TEXT_GENERATION + STRUCTURED_OUTPUT，全部允许激活
        assert.equal(
          evaluateActivationEligibility(byId[id], ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]).eligible,
          true,
          `${id} 应可激活`,
        );

        const contract: ComponentContract = { ...byId[id], componentId: f.compId };
        await createDraftContract({ componentId: f.compId, contractVersion: byId[id].contractVersion, contract });
        await publishContract({ componentId: f.compId, contractVersion: byId[id].contractVersion, publishedBy: f.adminId, autoActivate: true });

        const comp = await prisma.componentcatalog.findUnique({ where: { id: f.compId }, select: { activeContractId: true } });
        assert.ok(comp?.activeContractId, `${id} 激活后 activeContractId 必须存在`);

        // 前端 contractReady 状态来自数据库 API（GET /api/studio?action=catalog）
        const res = await studioGetRoute(new NextRequest("http://localhost/api/studio?action=catalog"));
        const data = await res.json();
        const entry = (data.data?.components ?? []).find((c: { id: string }) => c.id === f.compId);
        assert.ok(entry, "catalog 必须包含临时组件");
        assert.equal(entry.contractReady, true, `${id} contractReady 必须为 true`);
        assert.equal(entry.activeContractLifecycle, "PUBLISHED");
        assert.equal(entry.hasPublishedContract, true);

        // 快照不可变：激活后合同内容不得被改写
        const stored = await prisma.componentcontract.findUnique({ where: { id: comp!.activeContractId! } });
        assert.equal(stored?.lifecycle, "PUBLISHED");
        assert.equal((stored?.contract as { componentId?: string })?.componentId, f.compId);
      } finally {
        await f.cleanup();
      }
    }
  });

  test("2. 能力门禁：部署缺少合同所需能力时，路由执行被 403 拒绝且不扣点、不写任务", async () => {
    const f = await setupFixture();
    try {
      // 以 C01 真实合同为基础追加部署当前不具备的能力（VISION），复现真实能力缺口
      const base = byId.C01;
      const baseStep = base.executionPlan.steps[0];
      const contract: ComponentContract = {
        ...base,
        componentId: f.compId,
        executionPlan: {
          steps: [{ ...baseStep, requiredCapabilities: [...baseStep.requiredCapabilities, "VISION"] }],
        },
      };

      const eligibility = evaluateActivationEligibility(contract, ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]);
      assert.equal(eligibility.eligible, false, "缺 VISION 时不得视为可执行");
      assert.deepEqual(eligibility.missingCapabilities, ["VISION"]);

      await createDraftContract({ componentId: f.compId, contractVersion: contract.contractVersion, contract });
      await publishContract({ componentId: f.compId, contractVersion: contract.contractVersion, publishedBy: f.adminId, autoActivate: true });

      // 文件类合同必须先通过输入校验，才能抵达能力门禁
      const req = multipartReq(
        "http://localhost/api/studio",
        f.userToken,
        {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: f.compId,
          inputSource: JSON.stringify({ sourceType: "file", fileName: "spec.txt", mimeType: "text/plain" }),
        },
        [{ name: "spec.txt", content: "组件输入正文内容，用于抵达能力门禁校验。".repeat(3), mimeType: "text/plain" }],
      );
      const res = await studioPostRoute(req);
      const data = await res.json();
      assert.equal(res.status, 403, `能力不匹配必须 403，实际 ${res.status} body=${JSON.stringify(data).slice(0, 160)}`);
      assert.equal(data.code, "MODEL_CAPABILITY_NOT_SUPPORTED");

      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      await f.cleanup();
    }
  });

  test("3. 输入不符合合同的拒绝：C01 文件必填组件提交纯文本 → 400 INPUT_REQUIRED", async () => {
    const f = await setupFixture();
    try {
      await publishTempContract(f, byId.C01);
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: { activeContractId: (await prisma.componentcontract.findFirst({ where: { componentId: f.compId } }))!.id },
      });

      const req = jsonReq("http://localhost/api/studio", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "仅提供文本，未提供必需的招标文件",
      });
      const res = await studioPostRoute(req);
      const data = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(data).slice(0, 160)}`);
      assert.equal(data.code, "INPUT_REQUIRED");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "非法输入不得扣点");
    } finally {
      await f.cleanup();
    }
  });

  test("4. 多主材料合同驱动的数量校验：单文件合同拒绝多文件上传", async () => {
    const f = await setupFixture();
    try {
      // C01 为单文件合同（maxCount=1）：上传 2 个文件必须被合同层拒绝
      await publishTempContract(f, byId.C01);
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: { activeContractId: (await prisma.componentcontract.findFirst({ where: { componentId: f.compId } }))!.id },
      });

      const req = multipartReq(
        "http://localhost/api/studio",
        f.userToken,
        {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: f.compId,
          inputSource: JSON.stringify({ sourceType: "file", fileName: "a.txt", mimeType: "text/plain" }),
        },
        [
          { name: "a.txt", content: "材料一".repeat(20), mimeType: "text/plain" },
          { name: "b.txt", content: "材料二".repeat(20), mimeType: "text/plain" },
        ],
      );
      const res = await studioPostRoute(req);
      const data = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(data).slice(0, 160)}`);
      assert.equal(data.code, "INPUT_MULTIPLE_NOT_SUPPORTED");
      assert.match(String(data.error), /超过组件合同允许的最大数量/);
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "非法输入不得扣点");
    } finally {
      await f.cleanup();
    }
  });

  test("5. 图片/OCR 路径：图片合同接受 .png；无文字图片 → INPUT_TEXT_NOT_EXTRACTED（不扣点、不写任务）", async () => {
    const f = await setupFixture();
    try {
      // C01-C05 真实合同按业务均只接受文档，不接受图片；此处以图片合同承载，验证平台「图片 MIME + OCR 提取」链路
      const base = byId.C01;
      const contract: ComponentContract = {
        ...base,
        componentId: f.compId,
        input: {
          ...base.input,
          fileConstraints: {
            ...base.input.fileConstraints!,
            acceptedMimes: [".png", ".jpg", ".jpeg", ".txt"],
          },
        },
      };
      await createDraftContract({ componentId: f.compId, contractVersion: contract.contractVersion, contract });
      await publishContract({ componentId: f.compId, contractVersion: contract.contractVersion, publishedBy: f.adminId, autoActivate: true });

      // 1x1 透明 PNG（无任何文字）：OCR 提取为空 → 必须明确拒绝。
      // 使用确定性 OCR 替身（TEXT_EXTRACT_TEST_OCR_EMPTY），避免真实 tesseract 缺语言包时
      // 向控制台打印误导性的 "Error opening data file ... traineddata" 噪声。
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      );
      const req = multipartReq(
        "http://localhost/api/studio",
        f.userToken,
        {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: f.compId,
          inputSource: JSON.stringify({ sourceType: "file", fileName: "scan.png", mimeType: "image/png" }),
        },
        [{ name: "scan.png", content: png, mimeType: "image/png" }],
      );
      const prevOcrEmpty = process.env.TEXT_EXTRACT_TEST_OCR_EMPTY;
      process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = "true";
      let res: Response;
      let data: { code?: string };
      try {
        res = await studioPostRoute(req);
        data = await res.json();
      } finally {
        if (prevOcrEmpty === undefined) delete process.env.TEXT_EXTRACT_TEST_OCR_EMPTY;
        else process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = prevOcrEmpty;
      }
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(data).slice(0, 160)}`);
      assert.equal(data.code, "INPUT_TEXT_NOT_EXTRACTED", "无文字图片必须明确拒绝，绝不产生消费");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      await f.cleanup();
    }
  });

  test("6. 合同快照不可变：已 PUBLISHED 合同禁止原地改写（CONTRACT_IMMUTABLE）且内容零变更；C01-C05 只读快照稳定", async () => {
    // A) 机制验证（使用临时组件承载真实合同结构，绝不触碰真实 C01-C05 行）
    const f = await setupFixture();
    try {
      const source = byId.C02;
      await publishTempContract(f, source);
      const key = { componentId_contractVersion: { componentId: f.compId, contractVersion: source.contractVersion } };

      const before = await prisma.componentcontract.findUnique({ where: key });
      assert.equal(before?.lifecycle, "PUBLISHED", "发布后必须为 PUBLISHED");
      const beforeJson = JSON.stringify(before?.contract);

      // 试图原地改写已发布合同：必须被明确拒绝
      const tampered = {
        ...source,
        componentId: f.compId,
        executionPlan: { steps: [] },
      } as unknown as ComponentContract;
      await assert.rejects(
        () => updateDraftContract({ componentId: f.compId, contractVersion: source.contractVersion, contract: tampered }),
        (e: unknown) => (e as { code?: string })?.code === "CONTRACT_IMMUTABLE",
        "已发布合同必须禁止原地改写",
      );

      const after = await prisma.componentcontract.findUnique({ where: key });
      assert.equal(JSON.stringify(after?.contract), beforeJson, "已发布合同内容必须零变更");
      assert.equal(after?.lifecycle, "PUBLISHED", "已发布合同生命周期不得被改写");
    } finally {
      await f.cleanup();
    }

    // B) 真实 C01-C05：不可变快照稳定且与库内已发布内容一致（纯只读，不写库）
    for (const id of ["C01", "C02", "C03", "C04", "C05"]) {
      const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
      assert.ok(cat?.activeContractId, `${id} 必须已配置 activeContractId`);
      const stored = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! } });
      assert.equal(stored?.lifecycle, "PUBLISHED", `${id} 激活合同必须为 PUBLISHED`);

      const s1 = await getImmutableContractSnapshot(id);
      const s2 = await getImmutableContractSnapshot(id);
      assert.equal(s1.contract.componentId, id, `${id} 快照 componentId 必须一致`);
      assert.equal(s1.contract.lifecycle, "PUBLISHED", `${id} 快照必须来自 PUBLISHED 合同`);
      assert.deepEqual(s1.contract, s2.contract, `${id} 不可变快照重复读取必须完全一致`);
      assert.deepEqual(s1.contract, stored?.contract, `${id} 快照必须与库内已发布内容一致`);
    }
  });
});
