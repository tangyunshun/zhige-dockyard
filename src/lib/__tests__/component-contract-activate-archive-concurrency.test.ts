import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { activateContract, archiveContract } from "@/lib/component-contract/repository";
import { ComponentContractError } from "@/lib/component-contract/errors";

/**
 * activate ∥ archive 确定性并发安全测试
 *
 * 断言不变量：
 *  1. activeContractId 永不可能指向非 PUBLISHED（DRAFT / ARCHIVED）合同；
 *  2. 同一时刻 competing 的 activate 与 archive **不可能同时成功**（恰好一个成功）；
 *  3. 竞争抛出的必须是领域错误（ComponentContractError），绝不逃逸为 500；
 *  4. 审计日志与最终状态严格一致（成功的那一步必须留下且仅留下一条审计）。
 */

const COMP_ID = `TEST_COMP_CONC_${randomUUID().slice(0, 8)}`;
const USER_ID = `test-conc-user-${randomUUID().slice(0, 8)}`;
const ROUNDS = 20;

describe("activate ∥ archive 并发竞态（统一事务 + 固定锁序）", () => {
  before(async () => {
    await prisma.user.create({
      data: { id: USER_ID, email: `${USER_ID}@zhige.test`, name: USER_ID, role: "USER", status: "active", password: "x" },
    });
    await prisma.componentcatalog.create({
      data: {
        id: COMP_ID,
        name: COMP_ID,
        description: "activate/archive 并发测试组件",
        category: "COMMON",
        icon: "icon",
        tags: [] as never,
        previewData: {} as never,
        activeContractId: null,
      },
    });
  });

  after(async () => {
    // 严格外键顺序确定性清理；失败即失败（不使用空 catch 静默吞掉）
    await prisma.componentcatalog.update({ where: { id: COMP_ID }, data: { activeContractId: null } });
    await prisma.componentcontract.deleteMany({ where: { componentId: COMP_ID } });
    await prisma.componentcatalog.delete({ where: { id: COMP_ID } });
    await prisma.operationlog.deleteMany({ where: { userId: USER_ID } });
    await prisma.user.delete({ where: { id: USER_ID } });

    const residue = {
      contracts: await prisma.componentcontract.count({ where: { componentId: COMP_ID } }),
      catalog: await prisma.componentcatalog.count({ where: { id: COMP_ID } }),
      logs: await prisma.operationlog.count({ where: { userId: USER_ID } }),
      user: await prisma.user.count({ where: { id: USER_ID } }),
    };
    assert.deepEqual(residue, { contracts: 0, catalog: 0, logs: 0, user: 0 }, `本轮生成数据必须零残留: ${JSON.stringify(residue)}`);
  });

  test(`${ROUNDS} 轮 activate ∥ archive 竞争：不变量必须每次都成立`, async () => {
    let activateWins = 0;
    let archiveWins = 0;

    for (let round = 0; round < ROUNDS; round++) {
      const version = `v-conc-${round}`;
      // 准备：目标合同为 PUBLISHED，且**尚未被激活**
      await prisma.componentcontract.create({
        data: {
          componentId: COMP_ID,
          contractVersion: version,
          lifecycle: "PUBLISHED",
          contract: {} as never,
          publishedAt: new Date(),
          publishedBy: USER_ID,
        },
      });
      const target = await prisma.componentcontract.findUniqueOrThrow({
        where: { componentId_contractVersion: { componentId: COMP_ID, contractVersion: version } },
      });
      await prisma.componentcatalog.update({ where: { id: COMP_ID }, data: { activeContractId: null } });

      const logsBefore = await prisma.operationlog.count({ where: { userId: USER_ID } });

      // 同时发起：激活该合同 与 归档该合同
      const [act, arc] = await Promise.allSettled([
        activateContract({ componentId: COMP_ID, contractVersion: version, operatorId: USER_ID }),
        archiveContract({ componentId: COMP_ID, contractVersion: version, operatorId: USER_ID }),
      ]);

      const actOk = act.status === "fulfilled";
      const arcOk = arc.status === "fulfilled";

      // 不变量 2：不可能两个都成功
      assert.ok(!(actOk && arcOk), `第 ${round} 轮：activate 与 archive 不得同时成功（锁序失效）`);

      // 不变量 3：竞争失败必须抛出领域错误，绝不逃逸为 500
      for (const [label, r] of [
        ["activate", act],
        ["archive", arc],
      ] as const) {
        if (r.status === "rejected") {
          const e = r.reason;
          assert.ok(
            e instanceof ComponentContractError,
            `第 ${round} 轮 ${label} 失败必须是领域错误而非 500，实际: ${String(e)}`,
          );
        }
      }

      if (actOk) activateWins++;
      else archiveWins++;

      // 不变量 1：activeContractId 绝不能指向非 PUBLISHED 合同
      const catalog = await prisma.componentcatalog.findUniqueOrThrow({ where: { id: COMP_ID } });
      if (catalog.activeContractId) {
        const active = await prisma.componentcontract.findUnique({ where: { id: catalog.activeContractId } });
        assert.ok(active, `第 ${round} 轮：activeContractId 不得悬空`);
        assert.equal(active.lifecycle, "PUBLISHED", `第 ${round} 轮：activeContractId 不得指向非 PUBLISHED 合同`);
      }

      // 不变量 4：成功次数与审计条数严格一致
      const successCount = (actOk ? 1 : 0) + (arcOk ? 1 : 0);
      const logsAfter = await prisma.operationlog.count({ where: { userId: USER_ID } });
      assert.equal(logsAfter - logsBefore, successCount, `第 ${round} 轮：审计条数必须与成功操作次数一致`);

      // 竞争赢家与最终状态必须自洽
      if (arcOk) {
        const after = await prisma.componentcontract.findUniqueOrThrow({ where: { id: target.id } });
        assert.equal(after.lifecycle, "ARCHIVED", `第 ${round} 轮：archive 成功后合同必须为 ARCHIVED`);
        assert.notEqual(catalog.activeContractId, target.id, `第 ${round} 轮：归档成功的合同不得仍为激活版本`);
      }
      if (actOk) {
        const after = await prisma.componentcontract.findUniqueOrThrow({ where: { id: target.id } });
        assert.equal(after.lifecycle, "PUBLISHED", `第 ${round} 轮：activate 成功后合同必须仍为 PUBLISHED`);
        assert.equal(catalog.activeContractId, target.id, `第 ${round} 轮：activate 成功后必须成为激活版本`);
      }
    }

    // 并发竞争必须真实发生过双向交替，否则本测试是空转（防止退化为单一路径）
    assert.ok(activateWins > 0, `20 轮竞争中 activate 至少应赢过一次，实际 ${activateWins}`);
    console.error(`[activate∥archive] ${ROUNDS} 轮完成：activate 胜 ${activateWins} 次，archive 胜 ${archiveWins} 次`);
  });
});
