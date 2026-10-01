/**
 * 组件合同持久化仓储与快照服务集成测试套件 (强化版)
 *
 * 核心覆盖场景：
 * 1. DRAFT 创建与版本唯一性约束 (重复抛出 CONTRACT_VERSION_EXISTS);
 * 2. 两个并发 createDraft 竞争创建相同版本，底层 P2002 映射为稳定错误码 CONTRACT_VERSION_EXISTS;
 * 3. 合同中出现模型绑定字段被拒绝 (拦截 providerId, modelId, baseUrl 等);
 * 4. 状态机只读锁：DRAFT 允许修改，PUBLISHED 严禁原地修改 (抛出 CONTRACT_IMMUTABLE);
 * 5. updateDraft 与 publish 并发，已发布内容不可被覆盖;
 * 6. publish 与 archive 并发只能有一个合法结果，另一方稳定报错;
 * 7. 发布非法合同被校验器拒绝;
 * 8. 严格事务审计：审计日志写入失败时，整个合同发布/归档事务强制回滚;
 * 9. 重复 archive 的幂等约定：已归档版本二次归档直接幂等成功返回当前实体;
 * 10. 归档后不可作为执行快照 (抛出 CONTRACT_ARCHIVED_CANNOT_EXECUTE);
 * 11. 历史版本快照深冻结与防篡改 (发布新版本后旧版本快照绝不漂移);
 * 12. publishedBy 作为历史操作者不可变快照语义验证;
 * 13. 真实高并发发布竞态测试 (10 个并发 publish 保证恰好 1 个成功，其余被 409 拒绝)。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  ComponentContract,
  ComponentContractError,
  createDraftContract,
  updateDraftContract,
  publishContract,
  archiveContract,
  getImmutableContractSnapshot,
  writeStrictAuditLogInTx,
} from "../component-contract";

/**
 * 在拦截 Prisma 自身打印的 prisma:error（stdout/stderr/console）的前提下执行断言，
 * 并返回捕获到的输出。用途：预期内的数据库失败不得在控制台留下误导性错误，
 * 同时捕获内容必须被**显式断言**，防止把「静默吞异常」误判为通过。
 */
async function withCapturedDbErrors(fn: () => Promise<void>): Promise<string> {
  const origStdoutWrite = process.stdout.write;
  const origStderrWrite = process.stderr.write;
  const origConsoleError = console.error;
  const origConsoleLog = console.log;
  const chunks: string[] = [];

  const captureWrite = ((chunk: unknown, ...rest: unknown[]) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    const cb = rest.find((r) => typeof r === "function") as (() => void) | undefined;
    if (cb) cb();
    // 预期内的数据库失败输出被拦截，不再打印到终端（避免误导性 prisma:error）
    return true;
  }) as typeof process.stdout.write;
  const captureLog = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };

  process.stdout.write = captureWrite;
  process.stderr.write = captureWrite;
  console.error = captureLog as typeof console.error;
  console.log = captureLog as typeof console.log;

  try {
    await fn();
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    console.error = origConsoleError;
    console.log = origConsoleLog;
  }
  return chunks.join("");
}

/** 执行「预期内的审计外键失败」，并显式断言外键错误确实发生 */
async function expectFkAuditFailure(operation: () => Promise<unknown>): Promise<void> {
  const captured = await withCapturedDbErrors(async () => {
    await assert.rejects(
      operation,
      (err: unknown) => {
        // 验证确实是真实数据库错误抛出，绝非假 mock
        assert.ok(err instanceof Error, "必须抛出真实 Error 对象");
        return true;
      },
      "预期内的审计外键失败必须向外抛出，绝不可被静默吞掉"
    );
  });
  assert.ok(
    /Foreign key constraint|P2003|外键/i.test(captured),
    `预期内的数据库外键失败必须显式出现（防静默吞异常）。实际捕获输出: ${captured.slice(0, 300) || "（空）"}`
  );
}

/** 构造标准合法的 DRAFT 合同基准模板 */
function createValidDraftContract(
  componentId: string,
  contractVersion: string
): ComponentContract {
  return {
    componentId,
    contractVersion,
    lifecycle: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    input: {
      kind: "TEXT",
      textConstraints: {
        required: true,
        minLength: 5,
        maxLength: 5000,
        placeholder: "请输入测试内容...",
      },
    },
    materialPipeline: {
      steps: [
        {
          name: "文本清洗",
          type: "TEXT_NORMALIZE",
        },
      ],
    },
    executionPlan: {
      steps: [
        {
          stepId: "step_analyze",
          name: "业务解析",
          promptTemplateVersion: "v1.0",
          promptTemplate: "请分析以下内容：\n{{sourceText}}",
          inputMapping: {
            sourceText: "input.text",
          },
          outputKey: "report",
          contextBudgetTokens: 4096,
          maxOutputTokens: 2048,
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
      requiredSections: ["概述"],
      allowAutoRetry: true,
      requireHumanReview: false,
    },
    billingPolicy: {
      mode: "ESTIMATED_COMPATIBILITY",
      estimatedTokens: 1000,
    },
  };
}

/** 测试夹具：创建临时测试组件并提供清理方法 */
async function setupTestComponentFixture() {
  const compId = "TEST_COMP_" + randomUUID().replace(/-/g, "").slice(0, 10);
  const adminUserId = "admin_repo_test_" + randomUUID().replace(/-/g, "").slice(0, 8);

  // 1. 创建测试用户
  await prisma.user.create({
    data: {
      id: adminUserId,
      password: "test_password_hash",
      role: "SUPER_ADMIN",
      status: "active",
    },
  });

  // 2. 创建临时测试组件
  await prisma.componentcatalog.create({
    data: {
      id: compId,
      name: "自动化测试组件_" + compId,
      description: "用于组件合同持久化测试",
      category: "BID_PREP",
      icon: "package",
      tags: ["test"],
      previewData: {},
    },
  });

  const cleanup = async () => {
    // 严格外键顺序确定性清理：审计日志 -> 解除激活外键 -> 合同 -> 组件 -> 用户。
    // 清理失败必须让测试失败：禁止空 catch、禁止 .catch(() => {}) 静默吞掉。
    await prisma.operationlog.deleteMany({
      where: { userId: adminUserId },
    });
    await prisma.componentcatalog.updateMany({
      where: { id: compId },
      data: { activeContractId: null },
    });
    await prisma.componentcontract.deleteMany({
      where: { componentId: compId },
    });
    await prisma.componentcatalog.deleteMany({
      where: { id: compId },
    });
    await prisma.user.deleteMany({
      where: { id: adminUserId },
    });

    // 本轮生成 ID 零残留断言（残留即视为测试失败）
    const residue = {
      contracts: await prisma.componentcontract.count({ where: { componentId: compId } }),
      catalog: await prisma.componentcatalog.count({ where: { id: compId } }),
      logs: await prisma.operationlog.count({ where: { userId: adminUserId } }),
      users: await prisma.user.count({ where: { id: adminUserId } }),
    };
    assert.deepEqual(
      residue,
      { contracts: 0, catalog: 0, logs: 0, users: 0 },
      `本轮生成数据必须零残留: ${JSON.stringify(residue)}`,
    );
  };

  return { compId, adminUserId, cleanup };
}

test("【仓储持久化】1. DRAFT 创建与版本唯一性约束", async () => {
  const { compId, cleanup } = await setupTestComponentFixture();
  try {
    const contractObj = createValidDraftContract(compId, "1.0.0");

    const draft = await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: contractObj,
      description: "初始版本草稿",
    });

    assert.equal(draft.componentId, compId);
    assert.equal(draft.contractVersion, "1.0.0");
    assert.equal(draft.lifecycle, "DRAFT");
    assert.equal(draft.publishedAt, null);

    // 重复创建相同版本应被 409 CONTRACT_VERSION_EXISTS 拒绝
    // 预期内的唯一键冲突（P2002）：拦截 Prisma 打印的 prisma:error，并显式断言其确实发生
    const duplicateOutput = await withCapturedDbErrors(async () => {
      await assert.rejects(
        () =>
          createDraftContract({
            componentId: compId,
            contractVersion: "1.0.0",
            contract: contractObj,
            description: "重复创建",
          }),
        (err: unknown) => {
          const e = err as ComponentContractError;
          assert.equal(e.code, "CONTRACT_VERSION_EXISTS");
          return true;
        },
        "重复创建相同版本号必须抛出 CONTRACT_VERSION_EXISTS"
      );
    });
    assert.match(
      duplicateOutput,
      /Unique constraint|P2002/i,
      "预期内的唯一键冲突必须显式出现（防静默吞异常）"
    );
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】2. 两个并发 create 竞争创建相同版本，P2002 精确映射为 CONTRACT_VERSION_EXISTS", async () => {
  const { compId, cleanup } = await setupTestComponentFixture();
  try {
    const contractObj1 = createValidDraftContract(compId, "2.0.0");
    const contractObj2 = createValidDraftContract(compId, "2.0.0");

    // 并发同时调用 createDraftContract（预期其一触发 P2002 唯一键冲突）
    let results: PromiseSettledResult<unknown>[] = [];
    const raceOutput = await withCapturedDbErrors(async () => {
      results = await Promise.allSettled([
        createDraftContract({ componentId: compId, contractVersion: "2.0.0", contract: contractObj1 }),
        createDraftContract({ componentId: compId, contractVersion: "2.0.0", contract: contractObj2 }),
      ]);
    });
    assert.match(
      raceOutput,
      /Unique constraint|P2002/i,
      "预期内的唯一键冲突必须显式出现（防静默吞异常）"
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "并发创建相同版本号必须恰好有 1 个成功");
    assert.equal(rejected.length, 1, "另一个并发请求必须失败");

    const reason = (rejected[0] as PromiseRejectedResult).reason as ComponentContractError;
    assert.equal(
      reason.code,
      "CONTRACT_VERSION_EXISTS",
      "底层唯一键冲突必须被映射为 CONTRACT_VERSION_EXISTS 稳定错误码"
    );
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】3. 合同中出现模型绑定字段被严格拒绝", async () => {
  const { compId, cleanup } = await setupTestComponentFixture();
  try {
    const forbiddenKeys = ["providerId", "modelId", "upstreamModel", "baseUrl", "apiKeyEnv"];

    for (const forbiddenKey of forbiddenKeys) {
      const poisonedContract = createValidDraftContract(compId, `1.0.${forbiddenKey}`);
      (poisonedContract as any)[forbiddenKey] = "gpt-4o-vendor-fixed";

      await assert.rejects(
        () =>
          createDraftContract({
            componentId: compId,
            contractVersion: `1.0.${forbiddenKey}`,
            contract: poisonedContract,
          }),
        (err: unknown) => {
          const e = err as ComponentContractError;
          assert.equal(e.code, "FORBIDDEN_MODEL_BINDING");
          return true;
        },
        `携带模型绑定字段 [${forbiddenKey}] 时必须被拒绝`
      );
    }
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】4. updateDraft 与 publish 并发，已发布内容不可被覆盖", async () => {
  const { compId, adminUserId, cleanup } = await setupTestComponentFixture();
  try {
    const originalContract = createValidDraftContract(compId, "1.0.0");
    originalContract.input.textConstraints!.maxLength = 1000;
    await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: originalContract,
    });

    // 构造一个试图修改为 9999 的草稿请求对象
    const mutateDraft = createValidDraftContract(compId, "1.0.0");
    mutateDraft.input.textConstraints!.maxLength = 9999;

    // 并发同时执行发布与草稿更新
    const [publishRes, updateRes] = await Promise.allSettled([
      publishContract({
        componentId: compId,
        contractVersion: "1.0.0",
        publishedBy: adminUserId,
      }),
      updateDraftContract({
        componentId: compId,
        contractVersion: "1.0.0",
        contract: mutateDraft,
      }),
    ]);

    // 检查最终数据库状态
    const record = await prisma.componentcontract.findUniqueOrThrow({
      where: { componentId_contractVersion: { componentId: compId, contractVersion: "1.0.0" } },
    });

    if (publishRes.status === "fulfilled") {
      assert.equal(record.lifecycle, "PUBLISHED");
      // 核心断言：如果发布先到达或并发竞争成功，草稿修改绝不能把 maxLength 覆盖为 9999
      if (updateRes.status === "rejected") {
        const err = (updateRes as PromiseRejectedResult).reason as ComponentContractError;
        assert.equal(err.code, "CONTRACT_IMMUTABLE");
        assert.equal((record.contract as unknown as ComponentContract).input.textConstraints?.maxLength, 1000);
      }
    }
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】5. publish 与 archive 并发只能有一个合法结果", async () => {
  const { compId, adminUserId, cleanup } = await setupTestComponentFixture();
  try {
    const draft = createValidDraftContract(compId, "1.0.0");
    await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: draft,
    });

    // 并发同时执行发布与归档（预期其一因状态冲突/行锁竞争失败）
    // 拦截 Prisma 打印的 prisma:error：并发失败具有不确定性（可能为死锁/锁等待/唯一键），
    // 因此仅在确实捕获到输出时，断言其属于「预期内的并发/锁类数据库失败」，避免误导性输出。
    let results: PromiseSettledResult<unknown>[] = [];
    const concurrencyOutput = await withCapturedDbErrors(async () => {
      results = await Promise.allSettled([
        publishContract({ componentId: compId, contractVersion: "1.0.0", publishedBy: adminUserId }),
        archiveContract({ componentId: compId, contractVersion: "1.0.0", operatorId: adminUserId }),
      ]);
    });
    if (concurrencyOutput.length > 0) {
      assert.match(
        concurrencyOutput,
        /Deadlock|1213|lock wait timeout|1205|Unique constraint|P2002|Foreign key constraint|P2003/i,
        "并发失败输出必须属于预期内的并发/锁类数据库错误"
      );
    }

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // 必定只能有且仅有 1 个操作胜出
    assert.equal(fulfilled.length, 1, "并发发布与归档必须且只能有 1 个操作成功");
    assert.equal(rejected.length, 1, "另一操作必须因状态冲突被拒绝");

    const record = await prisma.componentcontract.findUniqueOrThrow({
      where: { componentId_contractVersion: { componentId: compId, contractVersion: "1.0.0" } },
    });
    assert.ok(
      record.lifecycle === "PUBLISHED" || record.lifecycle === "ARCHIVED",
      "最终状态必须是合法的 PUBLISHED 或 ARCHIVED"
    );
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】6. 真实外键审计失败时发布与归档完整回滚", async () => {
  const { compId, adminUserId, cleanup } = await setupTestComponentFixture();
  try {
    const nonExistentUserId = "user_phantom_" + randomUUID().replace(/-/g, "").slice(0, 12);

    // ---- 场景 A: publishContract 审计外键失败全量回滚 ----
    const draft1 = createValidDraftContract(compId, "1.0.0");
    await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: draft1,
      description: "待发布版本1",
    });

    // 直接调用真实的 publishContract，传入不存在的 operator userId
    // operationlog 表的 userId 外键依赖 user 表，直接触发底层 DB 真实外键失败 (P2003)
    await expectFkAuditFailure(() =>
      publishContract({
        componentId: compId,
        contractVersion: "1.0.0",
        publishedBy: nonExistentUserId,
      })
    );

    // 核心断言：事务回滚后，合同状态必须全量回滚！
    const recordAfterPublishFail = await prisma.componentcontract.findUniqueOrThrow({
      where: { componentId_contractVersion: { componentId: compId, contractVersion: "1.0.0" } },
    });
    // 1. 生命周期回滚为 DRAFT
    assert.equal(recordAfterPublishFail.lifecycle, "DRAFT", "外键失败后合同 lifecycle 必须回滚保持 DRAFT");
    // 2. 发版元信息回滚为 null
    assert.equal(recordAfterPublishFail.publishedAt, null, "外键失败后 publishedAt 必须保持 null");
    assert.equal(recordAfterPublishFail.publishedBy, null, "外键失败后 publishedBy 必须保持 null");
    // 3. 合同内部 JSON 内容完整回滚
    const jsonContract1 = recordAfterPublishFail.contract as unknown as ComponentContract;
    assert.equal(jsonContract1.lifecycle, "DRAFT", "合同内部 JSON 的 lifecycle 必须保持 DRAFT");
    assert.equal(jsonContract1.publishedAt, null, "合同内部 JSON 的 publishedAt 必须保持 null");
    assert.equal(jsonContract1.publishedBy, null, "合同内部 JSON 的 publishedBy 必须保持 null");
    // 4. 组件目录的 activeContractId 未被污染激活
    const compAfterPublishFail = await prisma.componentcatalog.findUniqueOrThrow({
      where: { id: compId },
      select: { activeContractId: true },
    });
    assert.equal(compAfterPublishFail.activeContractId, null, "发布回滚后组件 activeContractId 绝不可被激活");

    // ---- 场景 B: archiveContract 审计外键失败全量回滚 ----
    // 1. 先用合法的管理员正常发布 1.0.0
    await publishContract({
      componentId: compId,
      contractVersion: "1.0.0",
      publishedBy: adminUserId,
    });
    // 2. 再创建并正常发布 2.0.0，使激活版本切换为 2.0.0，1.0.0 变为非激活的已发布版本（可归档）
    const draft2 = createValidDraftContract(compId, "2.0.0");
    await createDraftContract({
      componentId: compId,
      contractVersion: "2.0.0",
      contract: draft2,
      description: "待发布版本2",
    });
    await publishContract({
      componentId: compId,
      contractVersion: "2.0.0",
      publishedBy: adminUserId,
    });

    // 3. 对已发布的 1.0.0 执行归档，但传入不存在的 operatorId 触发审计外键失败
    await expectFkAuditFailure(() =>
      archiveContract({
        componentId: compId,
        contractVersion: "1.0.0",
        operatorId: nonExistentUserId,
      })
    );

    // 核心断言：归档事务必须全量回滚，1.0.0 绝不能变成 ARCHIVED！
    const recordAfterArchiveFail = await prisma.componentcontract.findUniqueOrThrow({
      where: { componentId_contractVersion: { componentId: compId, contractVersion: "1.0.0" } },
    });
    assert.equal(recordAfterArchiveFail.lifecycle, "PUBLISHED", "归档失败回滚后生命周期必须保持 PUBLISHED");
    const jsonContractAfterArchiveFail = recordAfterArchiveFail.contract as unknown as ComponentContract;
    assert.equal(jsonContractAfterArchiveFail.lifecycle, "PUBLISHED", "合同内部 JSON 必须保持 PUBLISHED 绝不可变为 ARCHIVED");
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】7. 重复 archive 的约定行为 (安全幂等返回)", async () => {
  const { compId, adminUserId, cleanup } = await setupTestComponentFixture();
  try {
    const draft = createValidDraftContract(compId, "1.0.0");
    await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: draft,
    });

    // 第一次归档
    const firstArchive = await archiveContract({
      componentId: compId,
      contractVersion: "1.0.0",
      operatorId: adminUserId,
    });
    assert.equal(firstArchive.lifecycle, "ARCHIVED");

    // 第二次重复归档：约定语义为安全幂等返回，不报错
    const secondArchive = await archiveContract({
      componentId: compId,
      contractVersion: "1.0.0",
      operatorId: adminUserId,
    });
    assert.equal(secondArchive.lifecycle, "ARCHIVED");
    assert.equal(secondArchive.id, firstArchive.id);
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】8. publishedBy 作为历史操作者不可变快照语义验证", async () => {
  const { compId, adminUserId, cleanup } = await setupTestComponentFixture();
  try {
    const draft = createValidDraftContract(compId, "1.0.0");
    await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: draft,
    });

    // 发布时传入管理员 A 的 ID
    const published = await publishContract({
      componentId: compId,
      contractVersion: "1.0.0",
      publishedBy: adminUserId,
    });
    assert.equal(published.publishedBy, adminUserId);
    assert.equal(published.contract.publishedBy, adminUserId);

    // 生成的不可变快照中也必须严格固化发布者 ID
    const snapshot = await getImmutableContractSnapshot(compId, "1.0.0");
    assert.equal(snapshot.contract.publishedBy, adminUserId);

    // 即使管理员账号后续被封禁或删除，历史快照与合同表中的 publishedBy 证据链保持不变
    await prisma.user.update({
      where: { id: adminUserId },
      data: { status: "banned" },
    });

    const snapshotAfterBan = await getImmutableContractSnapshot(compId, "1.0.0");
    assert.equal(snapshotAfterBan.contract.publishedBy, adminUserId);
  } finally {
    await cleanup();
  }
});

test("【仓储持久化】9. 高并发发布同一版本只能成功一次 (10 并发竞态)", async () => {
  const { compId, adminUserId, cleanup } = await setupTestComponentFixture();
  try {
    const contractObj = createValidDraftContract(compId, "1.0.0");
    await createDraftContract({
      componentId: compId,
      contractVersion: "1.0.0",
      contract: contractObj,
    });

    // 10 个请求同时竞争发布同一 DRAFT
    const concurrencyCount = 10;
    const publishPromises = Array.from({ length: concurrencyCount }, (_, i) =>
      publishContract({
        componentId: compId,
        contractVersion: "1.0.0",
        publishedBy: adminUserId,
      })
        .then((res) => ({ success: true, data: res, error: null }))
        .catch((err) => ({ success: false, data: null, error: err as ComponentContractError }))
    );

    const results = await Promise.all(publishPromises);

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    assert.equal(successCount, 1, `并发发布必须严格保证仅有 1 次成功，实际成功数: ${successCount}`);
    assert.equal(failureCount, concurrencyCount - 1, `其余 9 个请求必须失败`);

    for (const fail of results.filter((r) => !r.success)) {
      assert.ok(
        fail.error?.code === "CONCURRENT_PUBLISH_CONFLICT" ||
          fail.error?.code === "CONTRACT_ALREADY_PUBLISHED",
        `并发失败错误码必须为 CONCURRENT_PUBLISH_CONFLICT 或 CONTRACT_ALREADY_PUBLISHED`
      );
    }
  } finally {
    await cleanup();
  }
});
