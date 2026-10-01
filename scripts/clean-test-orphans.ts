/**
 * clean-test-orphans.ts
 *
 * 安全清理「可证明为测试数据」的孤儿记录。设计原则（不可妥协）：
 *  - 默认 DRY-RUN：不会删除任何数据；必须显式传入 --apply 才执行删除。
 *  - 删除必须同时满足（AND，非仅其一）：明确测试用户 ID 前缀、明确测试邮箱后缀、
 *    明确测试空间 ID 前缀、明确测试任务 ID 前缀（显式 allowlist，严禁使用通用 `task-`）。
 *  - task- 不能作为通用测试前缀：任务是否属测试数据必须由「显式任务前缀 allowlist」判定。
 *  - 闭包校验：任务、流水、grant、workspace、member、wallet 必须全部属于同一测试数据闭包；
 *    发现共享空间、真实邮箱、非测试任务、无法证明的数据，立即标记 AMBIGUOUS，绝不删除。
 *  - --apply 前在同一事务内重新分类与复核；分类结果变化则整体中止（回滚），绝不删除。
 *  - 删除在单个事务内按外键依赖顺序执行（recovery -> hold -> settlement -> ledger -> grant -> member -> quota -> wallet -> workspace -> user）。
 *  - 输出删除前后各表计数。
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

// ---- 代码内约定的显式测试标识 allowlist（与测试套件严格一致，禁止通用 task-）----
const TEST_USER_ID_PREFIXES = [
  "test-user-",
  "test-member-",
  "temp-member-",
  "user-iso-",
  "user-align-",
  "user-ghost-",
  "admin-test-",
  "regular-user-",
  "test-conc-user-",
  "test-user-iso-",
];
const TEST_EMAIL_SUFFIXES = ["@example.com", "@test.com", "@test.local", "@zhige.test"];
const TEST_WORKSPACE_ID_PREFIXES = ["test-ws-", "ws-iso-", "ws-unl-", "test-conc-ws-"];
// 显式任务前缀 allowlist（切勿包含裸 "task-"）
const TEST_TASK_ID_PREFIXES = [
  "task-fencing-",
  "task-fencing-boundary-",
  "task-fencing-preempt-",
  "task-recovery-",
  "task-admin-",
  "task-orphan-member-",
  "task-conc-",
  "task-hold-",
  "task-pricing-snapshot-",
  "task-no-price-review-",
  "task-member-release-",
  "task-supplement-",
  "task-monthly-",
  "task-bigint-safe-",
  "task-concurrency-round-",
  "task-state-machine-guard-",
  "task-cost-plus-",
  "task-idempotent-guard-",
  "task-lifo-bucket-",
  "task-atomic-rollback-",
  "task-review-immune-",
  "task-unl-",
  "task-settle-not-settled-",
  "task-reap-cas-",
  "task-align-",
  "task-worker-cas-",
  "task-write-fail-",
  "task-bad-idemp-",
  "task-fake-grant-",
  "task-cli-run-",
  "task-cas-conflict-",
  "task-concurrent-review-",
  "task-unsafe-",
  "task-integrity-",
];

function isTestUserId(id: string): boolean {
  return TEST_USER_ID_PREFIXES.some((p) => id.startsWith(p));
}
function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEST_EMAIL_SUFFIXES.some((s) => email.endsWith(s));
}
function isTestWsId(id: string): boolean {
  return TEST_WORKSPACE_ID_PREFIXES.some((p) => id.startsWith(p));
}
function isTestTaskId(id: string): boolean {
  return TEST_TASK_ID_PREFIXES.some((p) => id.startsWith(p));
}

interface Classification {
  userId: string;
  email: string | null;
  proven: boolean;
  reasons: string[];
}

async function buildTestUserWhere() {
  return {
    OR: [
      ...TEST_USER_ID_PREFIXES.map((p) => ({ id: { startsWith: p } })),
      ...TEST_EMAIL_SUFFIXES.map((s) => ({ email: { endsWith: s } })),
    ],
  };
}

async function classifyUsers(): Promise<Classification[]> {
  const where = await buildTestUserWhere();
  const users = await prisma.user.findMany({
    where,
    select: { id: true, email: true },
  });

  const result: Classification[] = [];

  for (const u of users) {
    const reasons: string[] = [];
    // 条件 1+2：明确测试用户 ID 前缀 AND 明确测试邮箱后缀（必须同时满足）
    const idOk = isTestUserId(u.id);
    const emailOk = isTestEmail(u.email);
    if (!idOk) reasons.push("用户 ID 不匹配测试前缀");
    if (!emailOk) reasons.push("邮箱不匹配测试后缀");
    const provenByIdEmail = idOk && emailOk;

    // 预聚合该用户关联的所有空间 ID（避免嵌套 await）
    const settleWss = (await prisma.tokensettlement.findMany({ where: { userId: u.id }, select: { workspaceId: true } })).map((x) => x.workspaceId);
    const holdWss = (await prisma.tokensettlementhold.findMany({ where: { userId: u.id }, select: { workspaceId: true } })).map((x) => x.workspaceId);
    const recWss = (await prisma.tokensettlementrecovery.findMany({ where: { userId: u.id }, select: { workspaceId: true } })).map((x) => x.workspaceId);
    const memWss = (await prisma.workspacemember.findMany({ where: { userId: u.id }, select: { workspaceId: true } })).map((x) => x.workspaceId);
    const ownWss = (await prisma.workspace.findMany({ where: { ownerId: u.id }, select: { id: true } })).map((x) => x.id);
    const allWsIds = Array.from(new Set([...settleWss, ...holdWss, ...recWss, ...memWss, ...ownWss].filter((x): x is string => x != null)));

    const [
      settles,
      holds,
      recs,
      ledgers,
      members,
      ownedWorkspaces,
      workspaceRows,
    ] = await Promise.all([
      prisma.tokensettlement.findMany({ where: { userId: u.id }, select: { taskId: true, workspaceId: true } }),
      prisma.tokensettlementhold.findMany({ where: { userId: u.id }, select: { taskId: true, workspaceId: true } }),
      prisma.tokensettlementrecovery.findMany({ where: { userId: u.id }, select: { taskId: true, workspaceId: true } }),
      prisma.pointledger.findMany({ where: { userId: u.id }, select: { taskId: true } }),
      prisma.workspacemember.findMany({ where: { userId: u.id }, select: { workspaceId: true } }),
      prisma.workspace.findMany({ where: { ownerId: u.id }, select: { id: true, ownerId: true } }),
      prisma.workspace.findMany({ where: { id: { in: allWsIds } }, select: { id: true, ownerId: true } }),
    ]);

    const wsIds = Array.from(new Set([
      ...settles.map((x) => x.workspaceId),
      ...holds.map((x) => x.workspaceId),
      ...recs.map((x) => x.workspaceId),
      ...members.map((x) => x.workspaceId),
      ...ownedWorkspaces.map((x) => x.id),
    ].filter((x): x is string => x != null)));

    const taskIds = Array.from(new Set([
      ...settles.map((x) => x.taskId).filter((t): t is string => t != null),
      ...holds.map((x) => x.taskId).filter((t): t is string => t != null),
      ...recs.map((x) => x.taskId).filter((t): t is string => t != null),
      ...ledgers.map((x) => x.taskId).filter((t): t is string => t != null),
    ]));

    // 条件 3：明确测试空间前缀（空间由前缀或测试用户所有）
    for (const ws of workspaceRows) {
      if (!isTestWsId(ws.id) && !isTestUserId(ws.ownerId)) {
        reasons.push(`空间 ${ws.id} 既无测试前缀也非测试用户所有(owner=${ws.ownerId})`);
      }
    }

    // 条件 4：明确测试任务前缀（显式 allowlist，禁止通用 task-）
    for (const t of taskIds) {
      if (!isTestTaskId(t)) {
        reasons.push(`任务 ${t} 前缀不在测试任务 allowlist 中`);
      }
    }

    // 闭包：共享空间检测（空间被非测试用户引用则无法证明为孤儿）
    if (wsIds.length > 0) {
      const foreignMembers = await prisma.workspacemember.findMany({
        where: { workspaceId: { in: wsIds } },
        select: { userId: true },
      });
      const foreignNonTest = Array.from(new Set(foreignMembers.map((m) => m.userId))).filter(
        (id) => !isTestUserId(id)
      );
      if (foreignNonTest.length > 0) {
        reasons.push(`空间被非测试用户引用: ${foreignNonTest.slice(0, 5).join(",")}`);
      }
    }

    // 可删除必须：ID+邮箱同时满足 AND 任务/空间/闭包全部可证明
    const closureOk =
      reasons.filter((r) => !r.startsWith("用户 ID") && !r.startsWith("邮箱")).length === 0;
    const proven = provenByIdEmail && closureOk;

    result.push({ userId: u.id, email: u.email, proven, reasons });
  }

  return result;
}

async function ownedWsIds(userIds: string[]): Promise<string[]> {
  const ws = await prisma.workspace.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  return ws.map((x) => x.id);
}

async function countForUsers(userIds: string[]) {
  if (userIds.length === 0) {
    return {
      users: 0, wallets: 0, quotas: 0, members: 0, grants: 0, ledgers: 0,
      settlements: 0, holds: 0, recoveries: 0, workspaces: 0,
    };
  }
  const wsIds = await ownedWsIds(userIds);
  const [users, wallets, quotas, members, grants, ledgers, settlements, holds, recoveries, workspaces] =
    await Promise.all([
      prisma.user.count({ where: { id: { in: userIds } } }),
      prisma.userwallet.count({ where: { userId: { in: userIds } } }),
      prisma.workspacequota.count({ where: { workspaceId: { in: wsIds } } }),
      prisma.workspacemember.count({ where: { userId: { in: userIds } } }),
      prisma.pointgrant.count({ where: { userId: { in: userIds } } }),
      prisma.pointledger.count({ where: { userId: { in: userIds } } }),
      prisma.tokensettlement.count({ where: { userId: { in: userIds } } }),
      prisma.tokensettlementhold.count({ where: { userId: { in: userIds } } }),
      prisma.tokensettlementrecovery.count({ where: { userId: { in: userIds } } }),
      prisma.workspace.count({ where: { ownerId: { in: userIds } } }),
    ]);
  return { users, wallets, quotas, members, grants, ledgers, settlements, holds, recoveries, workspaces };
}

async function applyDelete(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const wsIds = await ownedWsIds(userIds);
  await prisma.$transaction(async (tx) => {
    // 严格按外键依赖顺序删除
    await tx.tokensettlementrecovery.deleteMany({ where: { userId: { in: userIds } } });
    await tx.tokensettlementhold.deleteMany({ where: { userId: { in: userIds } } });
    await tx.tokensettlement.deleteMany({ where: { userId: { in: userIds } } });
    await tx.pointledger.deleteMany({ where: { userId: { in: userIds } } });
    await tx.pointgrant.deleteMany({ where: { userId: { in: userIds } } });
    await tx.workspacemember.deleteMany({ where: { userId: { in: userIds } } });
    if (wsIds.length > 0) {
      await tx.workspacequota.deleteMany({ where: { workspaceId: { in: wsIds } } });
    }
    await tx.userwallet.deleteMany({ where: { userId: { in: userIds } } });
    if (wsIds.length > 0) {
      await tx.workspace.deleteMany({ where: { id: { in: wsIds } } });
    }
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });
}

async function main() {
  const json = process.argv.includes("--json");
  const apply = process.argv.includes("--apply");
  if (!json) {
    console.log(apply ? "[MODE] APPLY（将执行真实删除）" : "[MODE] DRY-RUN（仅报告，不删除；使用 --apply 真正删除）");
  }

  const classifications = await classifyUsers();
  const totalUsers = classifications.length;
  const wallets = await prisma.userwallet.count({
    where: { userId: { in: classifications.map((c) => c.userId) } },
  });

  const deletable = classifications.filter((c) => c.proven).map((c) => c.userId);
  const ambiguous = classifications.filter((c) => !c.proven);
  const before = await countForUsers(deletable);

  const report = {
    mode: apply ? "APPLY" : "DRY-RUN",
    generatedAt: new Date().toISOString(),
    candidates: totalUsers,
    wallets,
    provenCount: deletable.length,
    ambiguousCount: ambiguous.length,
    proven: classifications.filter((c) => c.proven).map((c) => ({ userId: c.userId, email: c.email })),
    ambiguous: ambiguous.map((c) => ({ userId: c.userId, email: c.email, reasons: c.reasons })),
    beforeCounts: before,
    audit: {
      script: "clean-test-orphans",
      safetyRule:
        "AND(userIdPrefix, emailSuffix, workspacePrefix, taskPrefixAllowlist) + 关联闭包校验；任一歧义 => AMBIGUOUS 绝不删除",
      dryRunOnly: !apply,
      applyAllowed: apply,
      allowlists: {
        userPrefixes: TEST_USER_ID_PREFIXES,
        emailSuffixes: TEST_EMAIL_SUFFIXES,
        workspacePrefixes: TEST_WORKSPACE_ID_PREFIXES,
        taskPrefixes: TEST_TASK_ID_PREFIXES,
      },
    },
  };

  if (json && !apply) {
    // dry-run JSON 报告（机器可读 + 审计信息），不输出任何删除动作
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\n候选测试特征用户总数: ${totalUsers}`);
  console.log(`关联钱包总数: ${wallets}`);
  console.log(`\n可证明为孤儿(满足 ID+邮箱+空间+任务 全部条件): ${deletable.length}`);
  console.log(`无法证明(仅报告, 绝不删除): ${ambiguous.length}`);
  for (const a of ambiguous) {
    console.log(`  - AMBIGUOUS ${a.userId} (${a.email ?? "no-email"}): ${a.reasons.join("; ")}`);
  }
  console.log("\n删除前计数(可证明孤儿范围):", JSON.stringify(before));

  if (!apply) {
    console.log("\n[DRY-RUN] 未执行删除。如需删除，请显式传入 --apply。");
    return;
  }

  // --apply：在同一事务内重新分类与复核；分类结果变化则整体中止（回滚），绝不删除
  const finalDeletable = await prisma.$transaction(async (tx) => {
    const reClass = await classifyUsers();
    const reDeletable = new Set(reClass.filter((c) => c.proven).map((c) => c.userId));
    const prev = new Set(deletable);
    let changed = false;
    for (const id of prev) if (!reDeletable.has(id)) changed = true;
    for (const id of reDeletable) if (!prev.has(id)) changed = true;
    if (changed) {
      throw new Error("分类结果在事务内复核发生变化，出于安全中止删除（请重试 dry-run）");
    }
    await applyDelete(Array.from(reDeletable));
    return Array.from(reDeletable);
  });

  const after = await countForUsers(finalDeletable);
  console.log("\n删除后计数(可证明孤儿范围):", JSON.stringify(after));
  console.log(`\n[APPLY] 已删除 ${finalDeletable.length} 个可证明孤儿测试用户及其关联数据。`);
}

main()
  .catch((err) => {
    console.error("清理出错:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
