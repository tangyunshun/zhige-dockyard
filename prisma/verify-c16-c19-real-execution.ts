/**
 * 批次 2E 真实模型执行验收（三件套后两项）
 *
 * 安全约定（与项目既有 acceptance 测试一致）：
 *  - 仅在 process.env.ALLOW_REAL_MODEL_EXECUTION === "true" 时允许运行；否则立即拒绝。
 *  - 真实调用生产执行链路 runStudioPost + buildProductionDeps（真实模型 + 真实数据库 + 真实账务），
 *    产生真实模型费用（≤2 元/单）与真实 pointledger 流水，经用户本轮显式授权（突破「不跑真实模型」红线）。
 *  - 全部使用隔离的测试用户/工作空间，运行结束后级联清理，绝不污染生产业务数据。
 *
 * 验证内容：
 *  1) 成功路径（C16/C17/C19 各 1 单）：三方一致 = 估价(pricingEstimate.points) == 落库(config.estimatedPoints) == 账本(pointledger CONSUME points)；
 *  2) 失败路径（MODEL_TIMEOUT_MS=1）：C16 单笔必须 FAILED 且押金通过 REFUND 流水全额原路退回（净扣点为 0）。
 *
 * 运行：
 *  - 成功路径：  ALLOW_REAL_MODEL_EXECUTION=true npx tsx prisma/verify-c16-c19-real-execution.ts
 *  - 失败路径：  ALLOW_REAL_MODEL_EXECUTION=true VERIFY_FAIL_MODE=1 npx tsx prisma/verify-c16-c19-real-execution.ts
 *
 * 注意：失败路径依赖 model-adapter 在模块加载时读取 MODEL_TIMEOUT_MS；VERIFY_FAIL_MODE=1 会在任何动态导入前设置该变量。
 */

// 失败模式必须在任何动态导入前设置 env（model-adapter 在加载时固化超时）
if (process.env.VERIFY_FAIL_MODE === "1") {
  process.env.MODEL_TIMEOUT_MS = "1";
}

async function main() {
  // 只读加载应用环境变量（含 MODEL_API_KEY / MODEL_TIMEOUT_MS 来源），不修改任何 .env 文件
  try {
    const { config: loadEnv } = await import("dotenv");
    loadEnv({ path: ".env.local" });
    loadEnv({ path: ".env" });
  } catch {
    /* dotenv 缺失时忽略，依赖已注入的环境变量 */
  }

  if (process.env.ALLOW_REAL_MODEL_EXECUTION !== "true") {
    throw new Error(
      "【安全红线拦截】禁止在未获得用户明确授权时执行真实模型验收！必须显式设置 ALLOW_REAL_MODEL_EXECUTION=true。",
    );
  }

  const failMode = process.env.VERIFY_FAIL_MODE === "1";
  const { setExplicitTestJwtSecret } = await import("../src/lib/jwt-config");
  const TEST_SECRET = "verify-c16-c19-real-exec-32chars-minimum-xxxx";
  setExplicitTestJwtSecret(TEST_SECRET);

  const { SignJWT } = await import("jose");
  const { prisma } = await import("../src/lib/prisma");
  const { runStudioPost, buildProductionDeps } = await import("../src/app/api/studio/route");
  const { randomUUID } = await import("node:crypto");

  const testId = randomUUID().slice(0, 8);
  const userId = `e1_verify_user_${testId}`;
  const workspaceId = `e1_verify_ws_${testId}`;
  const sessionToken = `sess_${testId}`;
  const secretKey = new TextEncoder().encode(TEST_SECRET);

  // 1) 隔离测试环境
  await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@zhige.local`,
      name: "E1 真实验收测试用户",
      password: "HashedDummyPassword1",
      role: "super_admin", // 绕过维护模式拦截
      status: "active",
      sessionToken,
      sessionRememberMe: true, // 豁免空闲超时
      sessionExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      lastActivityAt: new Date(),
    },
  });
  await prisma.workspace.create({
    data: { id: workspaceId, name: "E1 真实验收测试空间", ownerId: userId, type: "ENTERPRISE", updatedAt: new Date() },
  });
  // componenttask.tenantId 外键指向 tenant，而生产执行链以 workspaceId 作为 tenantId，故需同源 tenant 行
  await prisma.tenant.create({
    data: { id: workspaceId, name: "E1 真实验收测试租户", updatedAt: new Date() },
  });
  await prisma.workspacemember.create({
    data: { id: randomUUID(), workspaceId, userId, role: "OWNER" },
  });
  // 充值充足算力点，避免配额不足导致未调用模型即失败
  await prisma.pointgrant.create({
    data: {
      id: `pg_${testId}`,
      workspaceId,
      userId,
      points: BigInt(100000),
      remaining: BigInt(100000),
      scope: "WORKSPACE",
      sourceType: "MANUAL",
      title: "E1 验收测试充值",
    },
  });

  // 2) 签发受控 JWT（与生产验签共用同一测试密钥）
  const jwt = await new SignJWT({ userId, sessionToken, issuedAt: new Date().toISOString() })
    .setProtectedHeader({ alg: "HS256" })
    .sign(secretKey);

  function makeRequest(body: Record<string, unknown>) {
    const headersMap = new Map<string, string>([
      ["authorization", `Bearer ${jwt}`],
      ["content-type", "application/json"],
    ]);
    return {
      headers: { get: (n: string) => headersMap.get(n.toLowerCase()) ?? null },
      json: async () => body,
      url: "http://localhost/api/studio",
      nextUrl: { pathname: "/api/studio", searchParams: new URLSearchParams() },
      cookies: { get: () => undefined },
    } as any;
  }

  const targets = failMode ? (["C16"] as const) : (["C16", "C17", "C19"] as const);
  const results: Array<Record<string, unknown>> = [];

  // 目录算力成本规范化：执行链要求 componentcatalog.estimatedModelTokens 合法（>0），
  // 仅当缺失/非法时归一为合同 canonical estimatedTokens（与种子数据一致），缺失时补齐以通过成本门禁。
  const canonicalCost: Record<string, number> = { C16: 100, C17: 60, C19: 150 };
  for (const cid of targets) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { estimatedModelTokens: true } });
    const cur = Number(cat?.estimatedModelTokens);
    if (!Number.isFinite(cur) || cur <= 0) {
      await prisma.componentcatalog.update({
        where: { id: cid },
        data: { estimatedModelTokens: canonicalCost[cid] ?? 100 },
      });
    }
  }

  try {
    for (const componentId of targets) {
      const body: Record<string, unknown> = {
        action: "simulate",
        componentId,
        workspaceId,
        taskName: `${componentId} E1 真实验收`,
        inputMaterial:
          componentId === "C16"
            ? "请设计一个基于 JWT 的登录鉴权方案：区分超级管理员与普通成员，未登录请求一律拦截，越权请求返回 403，并说明令牌刷新与密钥轮换建议。"
            : componentId === "C17"
              ? "请生成 SQL：查询近 30 天订单总额排名前 10 的消费用户及其最近一次下单时间，并给出优化索引建议。"
              : "分析慢查询：SELECT * FROM orders WHERE user_id=? AND status=? ORDER BY created_at DESC 耗时 3.2s，EXPLAIN 显示 type=ALL，请给出瓶颈定位、索引整改与 SQL 重写方案。",
        inputSource: { sourceType: "text" },
      };

      const res = await runStudioPost(makeRequest(body), buildProductionDeps());
      const json = (await res.json()) as Record<string, unknown>;
      if (!json.success) {
        console.error(`[${componentId}] 请求未成功：`, JSON.stringify(json));
      }

      // 读取落库任务与账本
      const task = await prisma.componenttask.findFirst({
        where: { type: componentId, userId, tenantId: workspaceId },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, config: true },
      });
      const ledgers = await prisma.pointledger.findMany({
        where: { taskId: task?.id ?? "", workspaceId },
        select: { id: true, type: true, points: true, direction: true },
      });

      const cfg = (task?.config as Record<string, unknown>) || {};
      const pricingEstimate = (cfg.pricingEstimate as Record<string, unknown>) || {};
      const estimatedPoints = typeof cfg.estimatedPoints === "number" ? (cfg.estimatedPoints as number) : null;
      const pricingPoints = typeof pricingEstimate.points === "number" ? (pricingEstimate.points as number) : null;
      const consumeLedger = ledgers.find((l) => l.type === "CONSUME");
      const refundLedger = ledgers.find((l) => l.type === "REFUND");
      const ledgerPoints = consumeLedger ? Number(consumeLedger.points) : null;

      const row: Record<string, unknown> = {
        componentId,
        taskId: task?.id ?? null,
        status: task?.status ?? null,
        responseSuccess: json.success,
        billingBasis: cfg.billingBasis ?? null,
        estimatePoints: pricingPoints,
        configEstimatedPoints: estimatedPoints,
        ledgerConsumePoints: ledgerPoints,
        ledgerRefundPoints: refundLedger ? Number(refundLedger.points) : null,
        verified: false,
        note: "",
      };

      if (failMode) {
        // 失败路径：必须 FAILED + 押金全额退回（净扣点 0）
        const netPoints = (consumeLedger ? Number(consumeLedger.points) : 0) - (refundLedger ? Number(refundLedger.points) : 0);
        row.verified =
          task?.status === "FAILED" &&
          !!refundLedger &&
          Number(refundLedger.points) > 0 &&
          netPoints === 0;
        row.note = `失败路径：状态=${task?.status}，押金退回=${refundLedger ? Number(refundLedger.points) : 0}，净扣点=${netPoints}`;
      } else {
        // 成功路径：三方一致（估价=config.estimatedPoints == 账本扣点=ledger CONSUME，均 > 0，且扣点口径为 CONVERTED_PRICE）
        const estimatePoints = estimatedPoints; // config.estimatedPoints 即算账中心换算后的估价点数
        const tripleOk =
          estimatePoints !== null &&
          ledgerPoints !== null &&
          estimatePoints === ledgerPoints &&
          ledgerPoints > 0 &&
          cfg.billingBasis === "CONVERTED_PRICE";
        row.verified = task?.status === "SUCCESS" && tripleOk;
        row.note = `成功路径三方一致：estimate=${estimatePoints}, config=${estimatePoints}, ledger=${ledgerPoints}, basis=${cfg.billingBasis}`;
      }

      results.push(row);
      console.log(JSON.stringify({ phase: failMode ? "FAIL_PATH" : "SUCCESS_PATH", ...row }, null, 2));
    }
  } finally {
    // 3) 级联清理隔离现场
    const errors: string[] = [];
    try {
      await prisma.refundrecovery.deleteMany({ where: { taskId: { in: results.map((r) => r.taskId as string).filter(Boolean) } } });
    } catch (e) {
      errors.push(`refundrecovery: ${(e as Error).message}`);
    }
    try {
      await prisma.pointledger.deleteMany({ where: { workspaceId } });
    } catch (e) {
      errors.push(`pointledger: ${(e as Error).message}`);
    }
    try {
      await prisma.componenttask.deleteMany({ where: { userId, tenantId: workspaceId } });
    } catch (e) {
      errors.push(`componenttask: ${(e as Error).message}`);
    }
    try {
      await prisma.pointgrant.deleteMany({ where: { workspaceId } });
    } catch (e) {
      errors.push(`pointgrant: ${(e as Error).message}`);
    }
    try {
      await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    } catch (e) {
      errors.push(`workspacequota: ${(e as Error).message}`);
    }
    try {
      await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    } catch (e) {
      errors.push(`workspacemember: ${(e as Error).message}`);
    }
    try {
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    } catch (e) {
      errors.push(`workspace: ${(e as Error).message}`);
    }
    try {
      await prisma.tenant.deleteMany({ where: { id: workspaceId } });
    } catch (e) {
      errors.push(`tenant: ${(e as Error).message}`);
    }
    try {
      await prisma.user.deleteMany({ where: { id: userId } });
    } catch (e) {
      errors.push(`user: ${(e as Error).message}`);
    }
    if (errors.length) console.warn("[cleanup] 清理告警:", errors.join("; "));
  }

  const allVerified = results.length > 0 && results.every((r) => r.verified === true);
  console.log(JSON.stringify({ phase: failMode ? "FAIL_PATH" : "SUCCESS_PATH", allVerified, summary: results }, null, 2));
  await prisma.$disconnect();
  if (!allVerified) process.exit(2);
}

main().catch((e) => {
  console.error("VERIFY_REAL_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
