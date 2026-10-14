// 硬核顺序验证：临时摘掉默认模型 + 清零 test-01 个人空间算力点 -> 跑 C12 ->
// 应返回 MODEL_DEFAULT_NOT_CONFIGURED（而非 POINTS_INSUFFICIENT）-> 全部还原。
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const p = resolve(process.cwd(), ".env");
    const txt = readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
loadEnv();

const BASE = "http://127.0.0.1:3000";
const ACCOUNT = "test-01";
const PASSWORD = process.env.TEST_PWD || "";
const WS = "ws-personal-1787924572254-wu6kio";
const COMP = "C12";

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD, rememberMe: true }),
  });
  const j: any = await r.json();
  if (!j.success || !j.token) {
    console.log("LOGIN_FAIL", r.status, JSON.stringify(j));
    throw new Error("login failed");
  }
  return j.token as string;
}

async function runC12(token: string) {
  const r = await fetch(`${BASE}/api/studio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: "simulate",
      workspaceId: WS,
      componentId: COMP,
      inputMaterial: "一个用户可以下多个订单，一个订单只属于一个商家，商家可以同时上架多个商品。",
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  return { status: r.status, code: j.code, success: j.success, error: j.error };
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { getBalanceSummary } = await import("../src/lib/credit-service");

  const token = await login();
  // test-01 用户 ID（由登录环节确定）
  const userId = "cmtd04l660000y2miz6av52qn";

  // 1. 读取并保存「默认模型」与「全部余额来源」
  const policy: any = await prisma.workspace_model_policy.findUnique({ where: { workspaceId: WS } });
  const savedDefault = policy?.defaultDeploymentId ?? null;

  const grants: any[] = await prisma.pointgrant.findMany({
    where: {
      OR: [
        { scope: "WALLET", userId },
        { scope: { in: ["WORKSPACE", "PERSONAL_GIFT"] }, workspaceId: WS },
      ],
    },
  });
  const savedGrants = grants.map((g) => ({ id: g.id, remaining: g.remaining, status: g.status }));

  const wallet: any = await prisma.userwallet.findUnique({ where: { userId } });
  const savedWallet = wallet ? wallet.balance : null;

  const quota: any = await prisma.workspacequota.findUnique({ where: { workspaceId: WS } });
  const savedQuota = quota ? quota.tokenBalance : null;

  const balBefore: any = await getBalanceSummary(userId, WS);
  console.log("清零前可用余额 available =", balBefore.available, "(wallet=" + balBefore.walletBalance + ", ws=" + balBefore.workspaceBalance + ")");
  console.log("默认模型 =", savedDefault, " 相关 pointgrant 桶数 =", savedGrants.length, " wallet=", savedWallet, " quota=", String(savedQuota));

  // 2. 摘默认模型 + 清零所有余额来源
  await prisma.workspace_model_policy.update({ where: { workspaceId: WS }, data: { defaultDeploymentId: null as any } });
  for (const g of savedGrants) {
    await prisma.pointgrant.update({ where: { id: g.id }, data: { remaining: BigInt(0) } });
  }
  if (savedWallet !== null) await prisma.userwallet.update({ where: { userId }, data: { balance: BigInt(0) } });
  if (savedQuota !== null) await prisma.workspacequota.update({ where: { workspaceId: WS }, data: { tokenBalance: BigInt(0) } });

  const balAfter: any = await getBalanceSummary(userId, WS);
  console.log("清零后可用余额 available =", balAfter.available, "（应=0，确认余额不足可触发）");

  // 3. 跑 C12 —— 关键断言：即使余额=0，也应先被「模型门禁」拦截
  console.log("\n=== 硬核：无默认模型 + 余额清零 时跑 C12 ===");
  const res = await runC12(token);
  console.log("HTTP", res.status, "code=", res.code, "success=", res.success, "error=", res.error);

  // 4. 还原全部
  await prisma.workspace_model_policy.update({ where: { workspaceId: WS }, data: { defaultDeploymentId: savedDefault as any } });
  for (const g of savedGrants) {
    await prisma.pointgrant.update({ where: { id: g.id }, data: { remaining: g.remaining, status: g.status } });
  }
  if (savedWallet !== null) await prisma.userwallet.update({ where: { userId }, data: { balance: savedWallet } });
  if (savedQuota !== null) await prisma.workspacequota.update({ where: { workspaceId: WS }, data: { tokenBalance: savedQuota } });

  // 5. 还原后验证恢复
  const balRestored: any = await getBalanceSummary(userId, WS);
  console.log("\n还原后可用余额 available =", balRestored.available, "（应与清零前一致）");
  console.log("\n=== 还原后再次跑 C12 ===");
  const pos = await runC12(token);
  console.log("HTTP", pos.status, "code=", pos.code, "success=", pos.success, "error=", pos.error);

  const modelFirst = res.code === "MODEL_DEFAULT_NOT_CONFIGURED";
  const notPointsErr = res.code !== "POINTS_INSUFFICIENT";
  const restored = balRestored.available === balBefore.available && pos.code !== "MODEL_DEFAULT_NOT_CONFIGURED";
  console.log("\n结论: 模型先于算力点=" + (modelFirst && notPointsErr) + " (返回" + res.code + ")  还原成功=" + restored);
}

main()
  .catch((e) => { console.error("ERR", e); process.exit(1); })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
