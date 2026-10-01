import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * seed-c07-contract 目标裁决测试（真实 CLI + 隔离 fixture）
 *
 * 不变量：
 *  1. 无有效激活合同时**必须显式指定目标**，不得自动挑选（尤其禁止 published[0]）→ CONTRACT_ACTIVATION_TARGET_REQUIRED；
 *  2. 多版本候选下未显式指定 → 同样明确失败；
 *  3. 显式 --activate + 显式目标才允许写 activeContractId；
 *  4. 目标不存在 / 非 PUBLISHED → 明确失败；
 *  5. 重复执行（已激活且 PUBLISHED）→ KEEP，不写库。
 */

const uid = () => randomUUID().slice(0, 8);
const COMP = `TEST_COMP_SEED_${uid()}`;

function runSeed(extraArgs: string[] = []): { code: number; out: string } {
  const bin = process.platform === "win32" ? "npx.cmd" : "npx";
  const env = {
    ...process.env,
    PILOT_COMPONENT_ID: COMP,
    MODEL_API_KEY: process.env.MODEL_API_KEY || "sk-seed-target-test",
  };
  try {
    const out = execFileSync(bin, ["tsx", "prisma/seed-c07-contract.ts", ...extraArgs], {
      cwd: process.cwd(),
      env,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: typeof err.status === "number" ? err.status : -1, out: `${err.stdout ?? ""}\n${err.stderr ?? ""}` };
  }
}

async function addContract(version: string, lifecycle: string): Promise<string> {
  const id = randomUUID();
  await prisma.componentcontract.create({
    data: {
      id,
      componentId: COMP,
      contractVersion: version,
      lifecycle,
      contract: {} as never,
      publishedAt: lifecycle === "PUBLISHED" ? new Date() : null,
    },
  });
  return id;
}

describe("seed-c07-contract 合同激活目标裁决（禁止自动挑选）", () => {
  const createdContractIds: string[] = [];

  before(async () => {
    await prisma.componentcatalog.create({
      data: {
        id: COMP,
        name: COMP,
        description: "seed 目标裁决测试组件",
        category: "COMMON",
        icon: "icon",
        tags: [] as never,
        previewData: {} as never,
        activeContractId: null,
      },
    });
  });

  after(async () => {
    // 严格外键顺序：解除激活外键 → 合同 → 组件；失败即失败
    await prisma.componentcatalog.update({ where: { id: COMP }, data: { activeContractId: null } });
    await prisma.componentcontract.deleteMany({ where: { componentId: COMP } });
    await prisma.componentcatalog.delete({ where: { id: COMP } });

    const residue = {
      contracts: await prisma.componentcontract.count({ where: { componentId: COMP } }),
      catalog: await prisma.componentcatalog.count({ where: { id: COMP } }),
    };
    assert.deepEqual(residue, { contracts: 0, catalog: 0 }, `本轮生成数据必须零残留: ${JSON.stringify(residue)}`);
  });

  test("① 无 PUBLISHED 合同时明确失败（NO_PUBLISHED_CONTRACT）", async () => {
    createdContractIds.push(await addContract("1.0.0", "DRAFT"));
    const r = runSeed([]);
    assert.equal(r.code, 2, `退出码应为 2，实际 ${r.code}；输出: ${r.out}`);
    assert.match(r.out, /NO_PUBLISHED_CONTRACT/);
  });

  test("② 单一 PUBLISHED 但未显式指定目标 → CONTRACT_ACTIVATION_TARGET_REQUIRED", async () => {
    createdContractIds.push(await addContract("2.0.0", "PUBLISHED"));
    const r = runSeed([]);
    assert.equal(r.code, 2, `退出码应为 2；输出: ${r.out}`);
    assert.match(r.out, /CONTRACT_ACTIVATION_TARGET_REQUIRED/);
    // 未指定目标时绝不写库
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    assert.equal(row.activeContractId, null, "未显式指定目标时不得写入 activeContractId");
  });

  test("③ 多版本候选未显式指定 → 同样明确失败（不得 published[0] 自动挑选）", async () => {
    createdContractIds.push(await addContract("3.0.0", "PUBLISHED"));
    const r = runSeed([]);
    assert.equal(r.code, 2, `退出码应为 2；输出: ${r.out}`);
    assert.match(r.out, /CONTRACT_ACTIVATION_TARGET_REQUIRED/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    assert.equal(row.activeContractId, null, "多候选未指定时不得自动挑选");
  });

  test("④ 目标不存在 → TARGET_NOT_FOUND", async () => {
    const r = runSeed([`--contract-id=${randomUUID()}`, "--activate"]);
    assert.equal(r.code, 2, `退出码应为 2；输出: ${r.out}`);
    assert.match(r.out, /CONTRACT_ACTIVATION_TARGET_NOT_FOUND/);
  });

  test("⑤ 目标非 PUBLISHED → TARGET_NOT_PUBLISHED", async () => {
    const draftId = createdContractIds[0];
    const r = runSeed([`--contract-id=${draftId}`, "--activate"]);
    assert.equal(r.code, 2, `退出码应为 2；输出: ${r.out}`);
    assert.match(r.out, /CONTRACT_ACTIVATION_TARGET_NOT_PUBLISHED/);
  });

  test("⑥ 显式目标但缺少 --activate → 仅报告 ACTIVATION_REQUIRED，不写库", async () => {
    const r = runSeed(["--contract-version=3.0.0"]);
    assert.equal(r.code, 0, `退出码应为 0；输出: ${r.out}`);
    assert.match(r.out, /ACTIVATION_REQUIRED/);
    assert.match(r.out, /"wroteDatabase": false/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    assert.equal(row.activeContractId, null, "缺少 --activate 时不得写库");
  });

  test("⑦ 显式 --activate + 显式目标 → 精确激活该版本", async () => {
    const r = runSeed(["--contract-version=2.0.0", "--activate"]);
    assert.equal(r.code, 0, `退出码应为 0；输出: ${r.out}`);
    assert.match(r.out, /"action": "ACTIVATE"/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    assert.ok(row.activeContractId, "应写入 activeContractId");
    const active = await prisma.componentcontract.findUniqueOrThrow({ where: { id: row.activeContractId! } });
    assert.equal(active.contractVersion, "2.0.0", "必须精确激活显式指定的版本（而非其它候选）");
    assert.equal(active.lifecycle, "PUBLISHED");
  });

  test("⑧ 重复执行 → KEEP，且不再写库（幂等）", async () => {
    const r = runSeed([]);
    assert.equal(r.code, 0, `退出码应为 0；输出: ${r.out}`);
    assert.match(r.out, /"action": "KEEP"/);
    assert.match(r.out, /"wroteDatabase": false/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    const active = await prisma.componentcontract.findUniqueOrThrow({ where: { id: row.activeContractId! } });
    assert.equal(active.contractVersion, "2.0.0", "KEEP 语义下 activeContractId 不得被改动");
  });

  test("⑨ 已激活时指定不同目标但未加 --rebind → 必须拒绝，绝不隐式改绑", async () => {
    const r = runSeed(["--activate", "--contract-version=3.0.0"]);
    assert.equal(r.code, 2, `退出码应为 2；输出: ${r.out}`);
    assert.match(r.out, /REBIND_FLAG_REQUIRED/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    const active = await prisma.componentcontract.findUniqueOrThrow({ where: { id: row.activeContractId! } });
    assert.equal(active.contractVersion, "2.0.0", "未显式 --rebind 时 activeContractId 不得改动");
  });

  test("⑩ 显式 --rebind + 显式目标 → 换绑成功且输出 previous contract 审计", async () => {
    const r = runSeed(["--activate", "--rebind", "--contract-version=3.0.0"]);
    assert.equal(r.code, 0, `退出码应为 0；输出: ${r.out}`);
    assert.match(r.out, /"action": "REBIND"/);
    assert.match(r.out, /"previousContractVersion": "2.0.0"/, "换绑必须记录 previous contract 供审计");
    assert.match(r.out, /"rebindExplicit": true/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    const active = await prisma.componentcontract.findUniqueOrThrow({ where: { id: row.activeContractId! } });
    assert.equal(active.contractVersion, "3.0.0", "显式 --rebind 应精确换绑到指定版本");
  });

  test("⑪ --rebind 但未指定目标 → 必须拒绝，且不得改动激活合同", async () => {
    const r = runSeed(["--activate", "--rebind"]);
    assert.equal(r.code, 2, `退出码应为 2；输出: ${r.out}`);
    assert.match(r.out, /CONTRACT_ACTIVATION_TARGET_REQUIRED/);
    const row = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP } });
    const active = await prisma.componentcontract.findUniqueOrThrow({ where: { id: row.activeContractId! } });
    assert.equal(active.contractVersion, "3.0.0", "拒绝时 activeContractId 不得改动");
  });
});
