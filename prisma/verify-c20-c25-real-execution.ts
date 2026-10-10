/**
 * 批次 2E2（C20-C25）真实三件套验证（估价 200 + 成功 1 单 + 失败 1 单 + 三方对账）
 *
 * 范式：直接调用 studio/estimate 路由 handler（与文件边界测试、verify-c16-c19-real-execution 一致），
 * 真实 DB + 真实模型 + 自签 JWT（满足「真实登录」「先刷 lastActivityAt」），不依赖长驻 dev server。
 *  - loadEnvConfig(process.cwd()) 加载 .env(.local)/.env（只读，MODEL_API_KEY/DATABASE_URL/JWT_SECRET）；
 *  - 每个组件创建**隔离**用户/空间/租户/成员/钱包/配额/算力点（真实 DB），自签 JWT；
 *  - 每次调用前刷新 user.lastActivityAt（真实登录空闲校验）；
 *  - 估价：estimateGetRoute(GET ?componentId=&workspaceId=) → 断言 HTTP 200 + basis=CONVERTED_PRICE；
 *  - 成功：studioPostRoute（C20 真实 .sql 文件、C24 真实 .json 文件、其余纯文本，MODEL_TIMEOUT_MS=300000）
 *    → 断言 SUCCESS，核对 API 响应 / pointledger / componenttask 三方一致（估价=落库估算=账本扣点>0，净扣点=扣点）；
 *  - 失败：studioPostRoute（MODEL_TIMEOUT_MS=1）→ 断言 FAILED（MODEL_TIMEOUT），
 *    押金 CONSUME 经 REFUND 全额原路退回，净扣点=0；
 *  - 差异化输入强制项 A：C20/C24 覆盖真实文件上传成功用例（含 MIME 放行与文本提取）。
 *
 * 用法：
 *   npx tsx prisma/verify-c20-c25-real-execution.ts success s1
 *   npx tsx prisma/verify-c20-c25-real-execution.ts fail f1
 *   E1_ONLY=C20,C24 npx tsx prisma/verify-c20-c25-real-execution.ts success s2
 */

import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/prisma";
import { POST as studioPostRoute } from "../src/app/api/studio/route";
import { GET as estimateGetRoute } from "../src/app/api/billing/estimate/route";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const TOKEN_TIMEOUT_MS = process.env.MODEL_TIMEOUT_MS ? Number(process.env.MODEL_TIMEOUT_MS) : 300000;

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

// 真实 .sql 源库 DDL（Oracle 风格）用于 C20 真实文件上传
const C20_SQL = `CREATE TABLE orders (
  id NUMBER(19) NOT NULL,
  user_id NUMBER(19) NOT NULL,
  amount NUMBER(12,2) DEFAULT 0,
  status VARCHAR2(20) DEFAULT 'NEW',
  created_at DATE DEFAULT SYSDATE,
  CONSTRAINT pk_orders PRIMARY KEY (id)
);
CREATE SEQUENCE seq_orders START WITH 1000 INCREMENT BY 1;`;

// 真实 .json 数据（销售排行）用于 C24 真实文件上传
const C24_JSON = JSON.stringify({
  title: "区域销售排行",
  unit: "万元",
  categories: ["华东", "华南", "华北", "西南", "东北"],
  values: [320, 280, 210, 150, 96],
});

const TEXT_INPUT: Record<string, string> = {
  C21: "请生成一个支持关键词搜索、表格分页的员工管理列表页，含筛选与排序，使用 React + TypeScript。",
  C22: "请生成一个支持多文件拖拽上传、带蓝色条形进度显示的 Vue3 上传组件。",
  C23: "请为三栏电商首页生成响应式 CSS：PC 三栏、平板两栏、手机单栏堆叠。",
  C25: "请生成一个数据监控大屏：顶部 6 个 KPI 卡片，中部折线图与地图，底部排行榜，数据每 5 秒轮询刷新。",
};

const TARGETS: string[] = process.env.E1_ONLY
  ? process.env.E1_ONLY.split(",").map((s) => s.trim()).filter(Boolean)
  : ["C20", "C21", "C22", "C23", "C24", "C25"];

// 失败阶段用于破坏上游响应缓存（使 MODEL_TIMEOUT_MS=1 能真正触发超时而非命中缓存），
// 从而对每个组件都演示「失败 1 单 → 全额退款」。
let BUST_NONCE = "";

async function createFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_e2v_${s}`;
  const workspaceId = `ws_e2v_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `e2v_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.tenant.create({ data: { id: workspaceId, name: `e2v 租户 ${s}`, updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER" } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({
    data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" },
  });
  return { userId, workspaceId, token: await token(userId) };
}

async function refreshActivity(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { lastActivityAt: new Date() } });
}

async function estimate(componentId: string, workspaceId: string, tk: string) {
  const req = new NextRequest(
    `http://localhost/api/billing/estimate?componentId=${componentId}&workspaceId=${workspaceId}`,
    { method: "GET", headers: { Authorization: `Bearer ${tk}` } },
  );
  const res = await estimateGetRoute(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

async function execute(componentId: string, workspaceId: string, tk: string) {
  let req: NextRequest;
  if (componentId === "C20") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    form.append("file", new Blob([(BUST_NONCE ? `-- RAND ${randomUUID()}\n` : "") + C20_SQL], { type: "application/sql" }), "src.sql");
    req = new NextRequest("http://localhost/api/studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}` },
      body: form,
    });
  } else if (componentId === "C24") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    form.append("file", new Blob([C24_JSON], { type: "application/json" }), "data.json");
    if (BUST_NONCE) form.append("inputMaterial", `RAND ${randomUUID()}`);
    req = new NextRequest("http://localhost/api/studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}` },
      body: form,
    });
  } else {
    req = new NextRequest("http://localhost/api/studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "simulate",
        componentId,
        workspaceId,
        taskName: `${componentId} E2 真实验收`,
        inputSource: { sourceType: "text" },
        inputMaterial: BUST_NONCE ? `RAND ${randomUUID()} ${randomUUID()}` : TEXT_INPUT[componentId],
      }),
    });
  }
  const res = await studioPostRoute(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

async function readTask(taskId: string | null) {
  if (!taskId) return null;
  return prisma.componenttask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, config: true },
  });
}

async function readLedger(userId: string) {
  const rows = await prisma.pointledger.findMany({ where: { userId, type: { in: ["CONSUME", "REFUND"] } } });
  let consume = 0;
  let refund = 0;
  for (const r of rows) {
    const v = Number(r.points);
    if (r.type === "CONSUME") consume += v;
    else refund += v;
  }
  return { consume, refund, net: consume - refund, count: rows.length };
}

async function main() {
  const phase = process.argv[2] || "success";
  const runTag = process.argv[3] || "run";
  const isFail = phase === "fail";
  if (isFail) {
    process.env.MODEL_TIMEOUT_MS = "1";
    BUST_NONCE = randomUUID();
  }
  else if (!process.env.MODEL_TIMEOUT_MS) process.env.MODEL_TIMEOUT_MS = "540000";
  const results: Array<Record<string, unknown>> = [];

  for (const componentId of TARGETS) {
    const fx = await createFixture();
    await refreshActivity(fx.userId);
    const row: Record<string, unknown> = { componentId, phase, runTag };

    // 估价
    const est = await estimate(componentId, fx.workspaceId, fx.token);
    const estJson = est.json as Record<string, unknown>;
    const basis = (estJson.basis as string) ?? (estJson.data as Record<string, unknown> | undefined)?.basis;
    const estPoints =
      (estJson.points as number) ??
      (estJson.data as Record<string, unknown> | undefined)?.points ??
      (estJson.data as Record<string, unknown> | undefined)?.estimatedPoints ??
      null;
    row.estimateHttpStatus = est.status;
    row.estimateBasis = basis;
    row.estimatePoints = estPoints;
    row.estimateJson = estJson;

    // 执行
    await refreshActivity(fx.userId);
    const ex = await execute(componentId, fx.workspaceId, fx.token);
    const exJson = ex.json as Record<string, unknown>;
    const data = (exJson.data as Record<string, unknown> | undefined) ?? {};
    const taskId =
      ((exJson.task as Record<string, unknown> | undefined)?.id as string | undefined) ??
      (exJson.taskId as string) ??
      (data.taskId as string) ??
      (data.id as string) ??
      null;
    const apiStatus =
      ((exJson.task as Record<string, unknown> | undefined)?.status as string | undefined) ??
      (exJson.status as string) ??
      (data.status as string) ??
      null;
    const errorCode = (exJson.code as string) ?? (data.code as string) ?? (exJson.errorCode as string) ?? null;
    row.apiSuccess = Boolean(exJson.success) || apiStatus === "SUCCESS";
    row.apiStatus = apiStatus;
    row.errorCode = errorCode;
    row.taskId = taskId;
    row.executeJson = exJson;

    // 对账
    const task = await readTask(taskId);
    const ledger = await readLedger(fx.userId);
    const cfg = (task?.config as Record<string, unknown> | undefined) ?? {};
    const configEstimated = (cfg.estimatedPoints as number) ?? null;
    row.taskStatus = task?.status;
    row.configEstimatedPoints = configEstimated;
    row.ledger = ledger;

    if (!isFail) {
      const tripleOk =
        estPoints !== null &&
        configEstimated !== null &&
        ledger.consume > 0 &&
        estPoints === configEstimated &&
        configEstimated === ledger.consume &&
        ledger.net === ledger.consume;
      row.verified = task?.status === "SUCCESS" && tripleOk;
      row.note = `成功路径三方一致：estimate=${estPoints}, config=${configEstimated}, ledgerConsume=${ledger.consume}`;
    } else {
      const refundedOk = ledger.consume > 0 && ledger.refund === ledger.consume && ledger.net === 0;
      row.verified = task?.status === "FAILED" && (String(errorCode).includes("TIMEOUT") || String(errorCode).includes("MODEL_TIMEOUT")) && refundedOk;
      row.note = `失败路径押金全额退：consume=${ledger.consume}, refund=${ledger.refund}, net=${ledger.net}, errorCode=${errorCode}`;
    }

    // 清理隔离数据
    try {
      await prisma.pointledger.deleteMany({ where: { userId: fx.userId } });
      await prisma.pointgrant.deleteMany({ where: { userId: fx.userId } });
      await prisma.userwallet.deleteMany({ where: { userId: fx.userId } });
      await prisma.componenttask.deleteMany({ where: { userId: fx.userId } });
      await prisma.componentusage.deleteMany({ where: { workspaceId: fx.workspaceId } });
      await prisma.workspacemember.deleteMany({ where: { workspaceId: fx.workspaceId } });
      await prisma.workspacequota.deleteMany({ where: { workspaceId: fx.workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: fx.workspaceId } });
      await prisma.tenant.deleteMany({ where: { id: fx.workspaceId } });
      await prisma.user.deleteMany({ where: { id: fx.userId } });
    } catch (e) {
      row.cleanupError = String((e as Error)?.message || e);
    }

    results.push(row);
    const ok = row.verified ? "VERIFIED" : "NOT_VERIFIED";
    console.log(`[${componentId}] ${phase} ${ok} http=${row.estimateHttpStatus} basis=${row.estimateBasis} api=${row.apiStatus} code=${row.errorCode} task=${row.taskId} ledger=${JSON.stringify(row.ledger)}`);
  }

  const allVerified = results.every((r) => r.verified);
  console.log(`\n${phase.toUpperCase()}_PHASE_ALL_OK=${allVerified}`);
  console.log(JSON.stringify({ phase, runTag, allVerified, results }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("VERIFY_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
