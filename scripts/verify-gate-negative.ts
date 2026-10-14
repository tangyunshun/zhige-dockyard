// 原子化负向验证：临时摘掉 test-01 个人空间的默认模型 -> 跑 C12 -> 应被 MODEL_DEFAULT_NOT_CONFIGURED 拦截 -> 还原。
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

  // 1. 读取当前默认模型，确保存在可还原
  const policy: any = await prisma.workspace_model_policy.findUnique({ where: { workspaceId: WS } });
  const savedDefault = policy?.defaultDeploymentId ?? null;
  console.log("当前默认模型 deploymentId =", savedDefault);

  // 2. 临时摘掉默认模型（同时确认无 BYO 模型干扰）
  const byo = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: WS } });
  console.log("BYO 模型存在？", Boolean(byo));
  await prisma.workspace_model_policy.update({
    where: { workspaceId: WS },
    data: { defaultDeploymentId: null as any },
  });
  console.log("已临时摘掉默认模型");

  const token = await login();

  // 3. 跑 C12 —— 期望被默认模型门禁拦截（MODEL_DEFAULT_NOT_CONFIGURED）
  console.log("\n=== 负向：无默认模型时跑 C12 ===");
  const neg = await runC12(token);
  console.log("HTTP", neg.status, "code=", neg.code, "success=", neg.success, "error=", neg.error);

  // 4. 还原
  await prisma.workspace_model_policy.update({
    where: { workspaceId: WS },
    data: { defaultDeploymentId: savedDefault as any },
  });
  console.log("\n已还原默认模型为", savedDefault);

  // 5. 还原后再跑一次，确认恢复成功（不应再被模型门禁拦截）
  console.log("\n=== 还原后再次跑 C12 ===");
  const pos = await runC12(token);
  console.log("HTTP", pos.status, "code=", pos.code, "success=", pos.success, "error=", pos.error);

  const gateOk = neg.code === "MODEL_DEFAULT_NOT_CONFIGURED";
  const restoreOk = pos.code !== "MODEL_DEFAULT_NOT_CONFIGURED";
  console.log("\n结论: 门禁生效=" + gateOk + " 还原成功=" + restoreOk);
}

main()
  .catch((e) => { console.error("ERR", e); process.exit(1); })
  .finally(async () => {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  });
