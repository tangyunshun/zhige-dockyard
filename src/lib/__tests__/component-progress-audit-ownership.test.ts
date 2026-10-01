/**
 * 批次 2B 审计边界：activeContractId 跨组件归属检查（回归测试）
 *
 * 规则（buildComponentProgressAudit）：
 *  - activeContractId 对应合同除 lifecycle=PUBLISHED 外，必须满足 contract.componentId === catalog.id；
 *  - 不匹配（跨组件引用 / 指向非 PUBLISHED）计入 invalidActiveRef、invalidActiveRefComponents，executable=false；
 *  - requiredCapabilities 不得从错误归属的合同冒用（跨组件引用时为空）。
 *
 * 全部临时数据在 finally 严格清理；不修改任何真实组件（C06/C08/C10/C11/C07）。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildComponentProgressAudit } from "@/lib/component-progress-audit";
import { createDraftContract, publishContract } from "@/lib/component-contract/repository";
import type { ComponentContract } from "@/lib/component-contract/types";

async function createTempComponent(compId: string) {
  await prisma.componentcatalog.create({
    data: {
      id: compId,
      name: `归属校验临时组件_${compId}`,
      description: "跨组件归属审计回归（临时）",
      category: "REQ_DESIGN",
      icon: "Cpu",
      tags: ["ownership-audit"],
      estimatedModelTokens: 150,
      previewData: {},
      isPublished: true,
    },
  });
}

describe("进度审计：activeContractId 归属检查", () => {
  test("跨组件引用：计入 invalidActiveRef、executable=false、不冒用 requiredCapabilities", async () => {
    const compId = `C_OWN_X_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await createTempComponent(compId);
    try {
      // 将临时组件指向 C08 的已发布合同（componentId=C08，与临时组件不符）
      const c08 = await prisma.componentcatalog.findUnique({ where: { id: "C08" }, select: { activeContractId: true } });
      assert.ok(c08?.activeContractId, "C08 必须有 activeContractId");
      await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: c08!.activeContractId } });

      const audit = await buildComponentProgressAudit();
      const row = audit.capabilities.components.find((r) => r.componentId === compId);
      assert.ok(row, "审计必须包含临时组件");
      assert.equal(row!.activeLifecycle, "PUBLISHED", "被引用的合同本身是 PUBLISHED");
      assert.equal(row!.executable, false, "跨组件引用不得判定为可执行");
      assert.deepEqual(row!.requiredCapabilities, [], "跨组件引用不得冒用 C08 的 requiredCapabilities");
      assert.ok(audit.catalog.invalidActiveRefComponents.includes(compId), "必须计入 invalidActiveRefComponents");
      assert.ok(audit.catalog.invalidActiveRef >= 1, "invalidActiveRef 至少为 1");
    } finally {
      await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: null } }).catch(() => null);
      await prisma.componentcatalog.delete({ where: { id: compId } }).catch(() => null);
    }
  });

  test("合法归属（同组件 PUBLISHED）：计入 activePublished 且不计入 invalidActiveRef", async () => {
    const compId = `C_OWN_O_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await createTempComponent(compId);
    try {
      const base = (await import("@/lib/component-contract/catalog-contracts-c06-c08-c10-c11")).C08_CONTRACT;
      const contract: ComponentContract = { ...base, componentId: compId, contractVersion: "9.9.9" };
      await createDraftContract({ componentId: compId, contractVersion: "9.9.9", contract });
      await publishContract({ componentId: compId, contractVersion: "9.9.9", publishedBy: (await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true }, orderBy: { createdAt: "asc" } }))!.id, autoActivate: true });

      const audit = await buildComponentProgressAudit();
      const row = audit.capabilities.components.find((r) => r.componentId === compId);
      assert.ok(row, "审计必须包含临时组件");
      assert.equal(row!.activeLifecycle, "PUBLISHED");
      assert.equal(row!.executable, true, "合法归属且能力满足必须可执行");
      assert.deepEqual(row!.requiredCapabilities.slice().sort(), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"], "requiredCapabilities 必须来自自身合同");
      assert.ok(!audit.catalog.invalidActiveRefComponents.includes(compId), "合法归属不得计入 invalidActiveRef");
    } finally {
      await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: null } }).catch(() => null);
      await prisma.componentcontract.deleteMany({ where: { componentId: compId } });
      await prisma.componentcatalog.delete({ where: { id: compId } }).catch(() => null);
    }
  });

  test("指向非 PUBLISHED 合同的 activeContractId：计入 invalidActiveRef", async () => {
    const compId = `C_OWN_D_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    await createTempComponent(compId);
    try {
      const base = (await import("@/lib/component-contract/catalog-contracts-c06-c08-c10-c11")).C08_CONTRACT;
      const draft: ComponentContract = { ...base, componentId: compId, contractVersion: "0.0.1" };
      await createDraftContract({ componentId: compId, contractVersion: "0.0.1", contract: draft });
      const created = await prisma.componentcontract.findFirst({ where: { componentId: compId, contractVersion: "0.0.1" }, select: { id: true } });
      assert.ok(created, "草稿合同必须创建");
      // 故意把 activeContractId 指向未发布的草稿合同
      await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: created!.id } });

      const audit = await buildComponentProgressAudit();
      const row = audit.capabilities.components.find((r) => r.componentId === compId);
      assert.ok(row, "审计必须包含临时组件");
      assert.notEqual(row!.activeLifecycle, "PUBLISHED", "指向未发布合同时 activeLifecycle 不应为 PUBLISHED");
      assert.equal(row!.executable, false, "未发布合同不得可执行");
      assert.ok(audit.catalog.invalidActiveRefComponents.includes(compId), "必须计入 invalidActiveRefComponents");
    } finally {
      await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: null } }).catch(() => null);
      await prisma.componentcontract.deleteMany({ where: { componentId: compId } });
      await prisma.componentcatalog.delete({ where: { id: compId } }).catch(() => null);
    }
  });
});
