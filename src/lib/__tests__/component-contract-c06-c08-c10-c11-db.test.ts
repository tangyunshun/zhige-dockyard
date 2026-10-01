/**
 * 批次 2B（C06、C08、C10、C11）真实合同数据库验收
 *
 * 覆盖（对齐批次完成条件）：
 *  1. 已激活的四份真实合同：catalog API 诚实返回 contractReady / activeContractLifecycle / hasPublishedContract / requiredCapabilities；
 *  2. 临时组件承载真实合同结构：可发布并激活，且组件进度审计按数据库动态统计（不写死）；
 *  3. 输入缺失拒绝：400 INPUT_REQUIRED，不扣点、不写任务；
 *  4. 非法输入拒绝：文本过短 / 文本过长 / 多文件超限 / MIME 越界 → 400，不扣点、不写任务；
 *  5. 能力不足拒绝：缺 VISION 的合同 → 403 MODEL_CAPABILITY_NOT_SUPPORTED，不扣点、不写任务；
 *  6. 合同快照不可变：PUBLISHED 合同禁止原地改写（CONTRACT_IMMUTABLE）且内容零变更；四组件只读快照稳定。
 *
 * 说明：全部临时数据（用户/空间/额度/流水/任务/临时组件）在 finally 中严格清理，清理失败会使测试失败。
 *       绝不写入真实 C06/C08/C10/C11 合同行，也绝不触碰 C07/E。测试不执行真实模型调用（由独立真实验收文件覆盖）。
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
import {
  BATCH_2B,
  BATCH_2B_COMPONENT_IDS,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c06-c08-c10-c11";
import { buildComponentProgressAudit } from "@/lib/component-progress-audit";
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

/** 构造 multipart/form-data 请求（文件类/文本+文件类组件） */
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

const byId = Object.fromEntries(BATCH_2B.map((b) => [b.componentId, b.contract])) as Record<string, ComponentContract>;

/**
 * 临时夹具：超级管理员 + 普通用户 + 个人空间 + 临时组件（承载真实合同结构）。
 * 临时组件仅用于「发布/激活/快照/能力门禁」机制验证，绝不替代真实 C06/C08/C10/C11 行。
 */
async function setupFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const adminId = `u_c2bm_${suffix}`;
  const userId = `u_c2bu_${suffix}`;
  const workspaceId = `ws_c2b_${suffix}`;
  const compId = `C_TMP_2B_${suffix}`;
  const balance = BigInt(100000);

  await prisma.user.create({ data: { id: adminId, password: "t", role: "SUPER_ADMIN", status: "active" } });
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `C2B_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${suffix}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${suffix}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${suffix}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${suffix}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  await prisma.componentcatalog.create({
    data: {
      id: compId,
      name: `批次2B迁移验收组件_${suffix}`,
      description: "C06/C08/C10/C11 合同迁移验收（临时组件）",
      category: "REQ_DESIGN",
      icon: "Cpu",
      tags: ["c2b-migration"],
      estimatedModelTokens: 150,
      previewData: {},
      isPublished: true,
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

/**
 * 断言：该用户当前无任何扣点（CONSUME / 出账方向 / 退款）且无成功任务。
 * 注：新用户首次活动会由平台写入一条 GIFT_REGISTER 入账（注册福利，direction=IN），
 *     属平台既有行为、与本次请求无关，因此以「无扣点（direction=OUT=0）」+「无 CONSUME/REFUND」为判据。
 */
async function assertNoChargeNoTask(userId: string) {
  assert.equal(await prisma.pointledger.count({ where: { userId, type: "CONSUME" } }), 0, "被拒输入不得产生消费流水");
  assert.equal(await prisma.pointledger.count({ where: { userId, type: "REFUND" } }), 0, "被拒输入不得产生退款流水");
  assert.equal(await prisma.pointledger.count({ where: { userId, direction: "OUT" } }), 0, "被拒输入不得产生任何扣点（出账方向流水）");
  assert.equal(await prisma.componenttask.count({ where: { userId } }), 0, "被拒输入不得产生任务");
}

describe("批次 2B（C06/C08/C10/C11）真实合同数据库验收", () => {
  test("1. 四份真实合同已 PUBLISHED + 激活：catalog 诚实返回 contractReady / activeContractLifecycle / hasPublishedContract / requiredCapabilities", async () => {
    const res = await studioGetRoute(new NextRequest("http://localhost/api/studio?action=catalog"));
    assert.equal(res.status, 200);
    const data = await res.json();
    const components: Array<Record<string, unknown>> = data.data?.components ?? [];

    for (const id of BATCH_2B_COMPONENT_IDS) {
      const entry = components.find((c) => c.id === id);
      assert.ok(entry, `catalog 必须包含 ${id}`);
      assert.equal(entry.contractReady, true, `${id} contractReady 必须为 true`);
      assert.equal(entry.activeContractLifecycle, "PUBLISHED", `${id} activeContractLifecycle 必须为 PUBLISHED`);
      assert.equal(entry.hasPublishedContract, true, `${id} hasPublishedContract 必须为 true`);
      const caps = ((entry.requiredCapabilities as string[]) ?? []).slice().sort();
      const expected = Array.from(new Set(byId[id].executionPlan.steps.flatMap((s) => s.requiredCapabilities))).sort();
      assert.deepEqual(caps, expected, `${id} catalog 暴露的 requiredCapabilities 必须与合同一致`);

      // 数据库真源：activeContractId → PUBLISHED 合同，且内容与代码内合同定义一致（未被改写）
      const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
      assert.ok(cat?.activeContractId, `${id} 必须有 activeContractId`);
      const stored = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! } });
      assert.equal(stored?.lifecycle, "PUBLISHED", `${id} 激活合同必须为 PUBLISHED`);
      assert.equal(stored?.componentId, id);
      const storedContract = stored!.contract as { input?: unknown; materialPipeline?: unknown; executionPlan?: unknown; output?: unknown; qualityPolicy?: unknown; billingPolicy?: unknown };
      for (const key of ["input", "materialPipeline", "executionPlan", "output", "qualityPolicy", "billingPolicy"] as const) {
        assert.ok(storedContract[key], `${id} 落库合同必须包含完整 ${key} 定义`);
      }
    }
  });

  test("2. 进度审计按数据库动态统计：四组件 executable、无缺失能力；临时组件发布后亦被计入（不写死 60/54/6/10%）", async () => {
    const audit = await buildComponentProgressAudit();
    // 目录口径自洽（同一次审计结果内部一致）：各计数必须等于明细行的实际统计，总数来自数据库实际数量
    const c = audit.catalog;
    const rows = audit.capabilities.components;
    assert.ok(c.total > 0, "组件总数必须来自数据库实际数量");
    assert.equal(c.total, rows.length, "total 必须等于组件明细行数（数据库实际数量）");
    assert.equal(
      c.withActiveContract,
      rows.filter((r) => r.activeContractId !== null).length,
      "withActiveContract 必须等于 activeContractId 非空的明细数",
    );
    assert.equal(
      c.activePublished,
      rows.filter((r) => r.activeLifecycle === "PUBLISHED").length,
      "activePublished 必须等于激活合同为 PUBLISHED 的明细数",
    );
    assert.equal(
      audit.capabilities.executableCount,
      rows.filter((r) => r.executable).length,
      "executableCount 必须等于明细中 executable=true 的数量",
    );
    assert.equal(
      audit.capabilities.capabilitySatisfiedCount,
      audit.capabilities.executableCount,
      "capabilitySatisfiedCount 必须与 executableCount 一致",
    );
    assert.equal(
      c.contractCoveragePercent,
      Math.round((c.activePublished / c.total) * 1000) / 10,
      "覆盖率必须由 activePublished / total 实时计算",
    );

    for (const id of BATCH_2B_COMPONENT_IDS) {
      const row = rows.find((r) => r.componentId === id);
      assert.ok(row, `审计必须包含 ${id} 明细`);
      assert.equal(row!.activeLifecycle, "PUBLISHED", `${id} 激活合同必须为 PUBLISHED`);
      assert.deepEqual(row!.missingCapabilities, [], `${id} 不得有缺失能力`);
      assert.equal(row!.executable, true, `${id} 必须可执行`);
      // 统计只能来自数据库实际数据：四组件必须出现在「需证据能力」审查清单之外（未声明 VISION/FILE_ANALYSIS/LONG_CONTEXT）
      for (const cap of row!.requiredCapabilities) {
        assert.ok(
          !["VISION", "FILE_ANALYSIS", "LONG_CONTEXT"].includes(cap),
          `${id} 不得无证据声明需证据能力 ${cap}`,
        );
      }
    }

    // 临时组件：发布前后审计明细必须随数据库变化（证明统计来自数据库、非硬编码）
    // 注：此处只断言「自身组件」的明细，避免与并发运行的其他测试文件争用全局计数。
    const f = await setupFixture();
    try {
      const before = await buildComponentProgressAudit();
      const rowBefore = before.capabilities.components.find((r) => r.componentId === f.compId);
      assert.ok(rowBefore, "临时组件已存在于目录，审计必须包含其明细");
      assert.equal(rowBefore!.activeContractId, null, "未发布合同时不得有激活合同");
      assert.equal(rowBefore!.executable, false, "未发布合同时不得可执行");

      const contract: ComponentContract = { ...byId.C08, componentId: f.compId };
      await createDraftContract({ componentId: f.compId, contractVersion: byId.C08.contractVersion, contract });
      await publishContract({ componentId: f.compId, contractVersion: byId.C08.contractVersion, publishedBy: f.adminId, autoActivate: true });

      const after = await buildComponentProgressAudit();
      const rowAfter = after.capabilities.components.find((r) => r.componentId === f.compId);
      assert.ok(rowAfter, "发布后审计必须仍包含临时组件明细");
      assert.equal(rowAfter!.activeLifecycle, "PUBLISHED", "发布并激活后生命周期必须为 PUBLISHED");
      assert.equal(rowAfter!.activeContractVersion, byId.C08.contractVersion);
      assert.equal(rowAfter!.executable, true, "临时组件承接真实合同结构后必须可执行");
      assert.deepEqual(
        rowAfter!.requiredCapabilities.slice().sort(),
        ["STRUCTURED_OUTPUT", "TEXT_GENERATION"],
        "审计暴露的能力要求必须与合同一致",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("3. 输入缺失拒绝：400 INPUT_REQUIRED，不扣点、不写任务", async () => {
    const f = await setupFixture();
    try {
      // C06/C08/C10 为纯文本合同；C11 为文本+文件（二者皆空即无主材料）
      for (const id of ["C06", "C08", "C10", "C11"]) {
        const res = await studioPostRoute(
          jsonReq("http://localhost/api/studio", f.userToken, { action: "simulate", workspaceId: f.workspaceId, componentId: id }),
        );
        const body = await res.json();
        assert.equal(res.status, 400, `${id} 缺输入必须 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 200)}`);
        assert.equal(body.code, "INPUT_REQUIRED", `${id} 必须返回 INPUT_REQUIRED`);
      }
      await assertNoChargeNoTask(f.userId);
    } finally {
      await f.cleanup();
    }
  });

  test("4. 非法输入拒绝：文本过短/过长、多文件超限、MIME 越界 → 400，不扣点、不写任务", async () => {
    const f = await setupFixture();
    try {
      // 文本过短（合同 minLength=20）
      const shortRes = await studioPostRoute(
        jsonReq("http://localhost/api/studio", f.userToken, {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: "C06",
          inputMaterial: "太短",
        }),
      );
      const shortBody = await shortRes.json();
      assert.equal(shortRes.status, 400, `文本过短必须 400，body=${JSON.stringify(shortBody).slice(0, 200)}`);
      assert.equal(shortBody.code, "INPUT_TOO_SHORT", "文本过短必须返回 INPUT_TOO_SHORT");

      // 文本过长（合同 maxLength=20000）
      const longRes = await studioPostRoute(
        jsonReq("http://localhost/api/studio", f.userToken, {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: "C08",
          inputMaterial: "x".repeat(20_001),
        }),
      );
      const longBody = await longRes.json();
      assert.equal(longRes.status, 400, `文本过长必须 400，body=${JSON.stringify(longBody).slice(0, 200)}`);
      assert.equal(longBody.code, "INPUT_TOO_LARGE", "文本过长必须返回 INPUT_TOO_LARGE");

      // C11 单文件合同：多文件上传必须被合同层拒绝
      const multiRes = await studioPostRoute(
        multipartReq(
          "http://localhost/api/studio",
          f.userToken,
          {
            action: "simulate",
            workspaceId: f.workspaceId,
            componentId: "C11",
            inputSource: JSON.stringify({ sourceType: "file", fileName: "a.md", mimeType: "text/markdown" }),
          },
          [
            { name: "a.md", content: "接口需求一：用户注册接口，含字段校验。", mimeType: "text/markdown" },
            { name: "b.md", content: "接口需求二：订单查询接口，含分页与错误码。", mimeType: "text/markdown" },
          ],
        ),
      );
      const multiBody = await multiRes.json();
      assert.equal(multiRes.status, 400, `多文件必须 400，body=${JSON.stringify(multiBody).slice(0, 200)}`);
      assert.equal(multiBody.code, "INPUT_MULTIPLE_NOT_SUPPORTED", "必须返回 INPUT_MULTIPLE_NOT_SUPPORTED");

      // C11 MIME 白名单：不在 acceptedMimes 内的类型必须被拒
      const mimeRes = await studioPostRoute(
        multipartReq(
          "http://localhost/api/studio",
          f.userToken,
          {
            action: "simulate",
            workspaceId: f.workspaceId,
            componentId: "C11",
            inputSource: JSON.stringify({ sourceType: "file", fileName: "payload.exe", mimeType: "application/x-msdownload" }),
          },
          [{ name: "payload.exe", content: "MZ-binary-placeholder", mimeType: "application/x-msdownload" }],
        ),
      );
      const mimeBody = await mimeRes.json();
      assert.equal(mimeRes.status, 400, `MIME 越界必须 400，body=${JSON.stringify(mimeBody).slice(0, 200)}`);
      assert.equal(mimeBody.code, "INPUT_MIME_NOT_ALLOWED", "必须返回 INPUT_MIME_NOT_ALLOWED");

      await assertNoChargeNoTask(f.userId);
    } finally {
      await f.cleanup();
    }
  });

  test("5. 能力不足拒绝：合同要求 VISION 而部署不具备 → 403 MODEL_CAPABILITY_NOT_SUPPORTED，不扣点、不写任务", async () => {
    const f = await setupFixture();
    try {
      // 以 C06 真实合同为基础，追加部署当前不具备的能力（VISION），复现真实能力缺口
      const base = byId.C06;
      const baseStep = base.executionPlan.steps[0];
      const contract: ComponentContract = {
        ...base,
        componentId: f.compId,
        executionPlan: { steps: [{ ...baseStep, requiredCapabilities: [...baseStep.requiredCapabilities, "VISION"] }] },
      };

      // 纯函数裁决：缺 VISION 必须显式列出且不可激活
      const eligibility = evaluateActivationEligibility(contract, ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]);
      assert.equal(eligibility.eligible, false, "缺 VISION 时不得视为可执行");
      assert.deepEqual(eligibility.missingCapabilities, ["VISION"]);

      await createDraftContract({ componentId: f.compId, contractVersion: contract.contractVersion, contract });
      await publishContract({ componentId: f.compId, contractVersion: contract.contractVersion, publishedBy: f.adminId, autoActivate: true });

      const res = await studioPostRoute(
        jsonReq("http://localhost/api/studio", f.userToken, {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: f.compId,
          inputMaterial: "投入 180 万元，预计月增收入 30 万元，请测算投资回收周期与 ROI。",
        }),
      );
      const body = await res.json();
      assert.equal(res.status, 403, `能力不足必须 403，实际 ${res.status} body=${JSON.stringify(body).slice(0, 220)}`);
      assert.equal(body.code, "MODEL_CAPABILITY_NOT_SUPPORTED", "必须返回 MODEL_CAPABILITY_NOT_SUPPORTED");

      // 审计：该组件必须被标记为能力阻断（missingCapabilities 非空、executable=false）
      const audit = await buildComponentProgressAudit();
      const row = audit.capabilities.components.find((r) => r.componentId === f.compId);
      assert.ok(row, "审计必须包含临时组件");
      assert.deepEqual(row!.missingCapabilities, ["VISION"]);
      assert.equal(row!.executable, false, "缺能力组件必须不可执行");
      assert.ok(audit.capabilities.blockedByCapabilityCount >= 1, "必须计入能力阻断组件数");

      await assertNoChargeNoTask(f.userId);
    } finally {
      await f.cleanup();
    }
  });

  test("6. 合同快照不可变：PUBLISHED 禁止原地改写且内容零变更；四组件只读快照稳定", async () => {
    // A) 机制验证（临时组件承载真实合同结构，绝不触碰真实 C06/C08/C10/C11 行）
    const f = await setupFixture();
    try {
      const source = byId.C10;
      await createDraftContract({
        componentId: f.compId,
        contractVersion: source.contractVersion,
        contract: { ...source, componentId: f.compId },
      });
      await publishContract({ componentId: f.compId, contractVersion: source.contractVersion, publishedBy: f.adminId, autoActivate: true });
      const key = { componentId_contractVersion: { componentId: f.compId, contractVersion: source.contractVersion } };

      const before = await prisma.componentcontract.findUnique({ where: key });
      assert.equal(before?.lifecycle, "PUBLISHED", "发布后必须为 PUBLISHED");
      const beforeJson = JSON.stringify(before?.contract);

      const tampered = { ...source, componentId: f.compId, executionPlan: { steps: [] } } as unknown as ComponentContract;
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

    // B) 真实 C06/C08/C10/C11：不可变快照稳定且与库内已发布内容一致（纯只读，不写库）
    for (const id of BATCH_2B_COMPONENT_IDS) {
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
      // 业务字段必须与代码内批次合同定义逐项一致（生命周期元数据除外）
      const strip = (c: ComponentContract) => ({
        componentId: c.componentId,
        contractVersion: c.contractVersion,
        input: c.input,
        materialPipeline: c.materialPipeline,
        executionPlan: c.executionPlan,
        output: c.output,
        qualityPolicy: c.qualityPolicy,
        billingPolicy: c.billingPolicy,
      });
      assert.deepEqual(
        strip(s1.contract as ComponentContract),
        strip(byId[id]),
        `${id} 落库合同的业务字段必须与批次合同定义逐项一致（未被改写）`,
      );
    }
  });
});
