/**
 * 真实 HTTP 验收共享库（CORE-3-GOLDEN-PATH-FINAL-CLOSURE-R2 §四）
 *
 * 硬约束：
 *  - 只通过真实 HTTP（fetch）访问 /api/auth/login、/api/studio、/api/tasks、/api/studio?action=task_detail；
 *  - 绝不 import { POST } / 绝不构造 NextRequest / 绝不自签 JWT / 绝不改写用户 sessionToken；
 *  - 用户、空间、凭据一律来自环境变量，脚本内零硬编码；
 *  - DB 侧仅只读查询（用于响应/DB/详情三方一致性核对）。
 */
import { prisma } from "../src/lib/prisma";

export const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
export const ACCOUNT = process.env.TEST_ACCOUNT || "";
export const PWD = process.env.TEST_PWD || "";
export const WS = process.env.WORKSPACE_ID || "";
export const COMPS = (process.env.ACCEPT_COMPS || "C01,C02,C07").split(",").map((s) => s.trim()).filter(Boolean);

export function requireEnv() {
  const missing = [
    !ACCOUNT ? "TEST_ACCOUNT" : null,
    !PWD ? "TEST_PWD" : null,
    !WS ? "WORKSPACE_ID" : null,
  ].filter(Boolean);
  if (missing.length) throw new Error(`缺少必需环境变量: ${missing.join(", ")}（脚本禁止硬编码用户/空间/密钥）`);
}

/** 真实登录：POST /api/auth/login，服务端签发 token（不伪造）。绝不回显密码/token。 */
export async function realLogin(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account: ACCOUNT, password: PWD, rememberMe: false }),
  });
  const j = await r.json().catch(() => ({}) as any);
  if (!r.ok || !j?.token) {
    throw new Error(`真实登录失败 HTTP=${r.status} code=${j?.code || j?.error || "未知"}`);
  }
  return j.token as string;
}

/** 真实提交任务：multipart 文件上传（符合合同输入要求）。 */
export async function simulate(token: string, componentId: string, fileText: string, fileName: string) {
  const fd = new FormData();
  fd.append("action", "simulate");
  fd.append("workspaceId", WS);
  fd.append("componentId", componentId);
  fd.append("inputSource", JSON.stringify({ sourceType: "file" }));
  fd.append("file", new File([fileText], fileName, { type: "text/plain" }));
  const r = await fetch(`${BASE}/api/studio`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
    signal: AbortSignal.timeout(600000),
  });
  const text = await r.text();
  let j: any = {};
  try { j = JSON.parse(text); } catch {}
  return { status: r.status, json: j };
}

/** task_detail 是 GET 端点（route.ts runStudioGet：action=task_detail）。 */
export async function taskDetail(token: string, taskId: string) {
  const r = await fetch(`${BASE}/api/studio?action=task_detail&taskId=${encodeURIComponent(taskId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json().catch(() => ({}) as any);
  return { status: r.status, json: j };
}

/** /api/tasks 列表（真实 HTTP）。 */
export async function tasksList(token: string) {
  const r = await fetch(`${BASE}/api/tasks`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(120000),
  });
  const j = await r.json().catch(() => ({}) as any);
  return { status: r.status, json: j };
}

/** 只读 DB 事实：任务 + CONSUME/REFUND 流水 + 恢复记录。 */
export async function dbFacts(taskId: string) {
  const task = await prisma.componenttask.findUnique({ where: { id: taskId } });
  const cfg: any = (task?.config as any) || {};
  const res: any = (task?.result as any) || {};
  const ledger = await prisma.pointledger.findMany({
    where: { taskId, type: { in: ["CONSUME", "REFUND"] } },
    select: { type: true, points: true },
  });
  const recovery = await prisma.refundrecovery.findMany({
    where: { taskId },
    select: { status: true, points: true },
  });
  return {
    status: task?.status ?? null,
    executionMode: cfg.executionMode ?? null,
    contractVersion: cfg.contractVersion ?? null,
    errorCode: res.errorCode ?? null,
    artifactCount: Array.isArray(res.artifacts) ? res.artifacts.length : 0,
    hasArtifact: res.hasArtifact ?? null,
    estimatedPoints: cfg.estimatedPoints ?? null,
    actualPoints: cfg.actualPoints ?? null,
    billingMode: cfg.billingMode ?? null,
    totalTokens: cfg.totalTokens ?? null,
    inputTokens: cfg.inputTokens ?? null,
    outputTokens: cfg.outputTokens ?? null,
    consume: ledger.filter((l: any) => l.type === "CONSUME").map((l: any) => Number(l.points)),
    refund: ledger.filter((l: any) => l.type === "REFUND").map((l: any) => Number(l.points)),
    recovery: recovery.map((r: any) => ({ status: r.status, points: Number(r.points) })),
  };
}

export function newRunId(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export async function writeManifest(fileName: string, manifest: any) {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), ".codebuddy", "acceptance");
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, fileName);
  await fs.writeFile(p, JSON.stringify(manifest, null, 2), "utf-8");
  return p;
}
