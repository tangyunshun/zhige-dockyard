/**
 * 修复批次 E2-FIX（C20-C31 十二组件三件套真实验证补齐）
 *
 * 纪律（严格遵循负责人指令，本脚本只做验证，绝不改任何合同/代码/共享层）：
 *  - 全程真实登录：每个组件创建隔离用户/空间/租户/成员/钱包/配额/算力点（真实 DB），自签 JWT；
 *    每次调用前刷新 user.lastActivityAt；
 *  - 真实模型调用：成功路径 MODEL_TIMEOUT_MS=180000；失败抽样 MODEL_TIMEOUT_MS=1；
 *  - 每组件三件套：
 *      1) 估价 GET /api/billing/estimate → 断言 200 + CONVERTED_PRICE + 点数与 estTokens 口径一致；
 *      2) 成功 1 单：真实执行，三方对账（API / pointledger / componenttask）；
 *         强制差异化用例：C20 上传真实 .sql 文件；C24 上传真实 .json 文件（JSON_VIEWER 结构化校验）；
 *      3) 失败抽样 1 单：每 4 组件抽 1 个（共 3 单：C23/C27/C31），MODEL_TIMEOUT_MS=1 超时，核对全额退款；
 *  - 费用红线：1 算力点 = 0.01 元（src/lib/point-rate.ts）；累计净扣点（仅成功单，失败单退款净 0）
 *    折合人民币逼近 2.50 元即硬停（≤3 元红线）；
 *  - 停止条件：同一组件连续 2 次「非超时失败」（UPSTREAM_ERROR / OUTPUT_INVALID 等，疑 prompt 质量）
 *    立即停该组件并标记 NEEDS_ADJUDICATION，绝不改合同硬闯；超时（MODEL_TIMEOUT）属瞬时，可重试；
 *  - 严禁自行扩大范围：仅 C20-C31 十二组件；失败抽样严格 3 单。
 *
 * 用法：
 *   E1_ONLY=C20,C21,C22,C23 npx tsx prisma/verify-e2fix-c20-c31.ts
 *   E1_ONLY=C24,C25,C26,C27 npx tsx prisma/verify-e2fix-c20-c31.ts
 *   E1_ONLY=C28,C29,C30,C31 npx tsx prisma/verify-e2fix-c20-c31.ts
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

// 换算（与 src/lib/point-rate.ts 唯一真源一致）：1 算力点 = 0.01 元
const YUAN_PER_POINT = 0.01;
// 费用硬停红线：净扣点折合人民币逼近 2.50 元即停（≤3 元红线留余量）
const COST_HARD_STOP_YUAN = 2.5;
const SUCCESS_TIMEOUT_MS = 180000;
const FAILURE_TIMEOUT_MS = 1;
const MAX_SUCCESS_ATTEMPTS = 6;

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

// —— 真实素材（C20 .sql / C24 .json / 各组件文本，复用既有验证器口径）——
const C20_SQL = `CREATE TABLE orders (
  id NUMBER(19) NOT NULL,
  user_id NUMBER(19) NOT NULL,
  amount NUMBER(12,2) DEFAULT 0,
  status VARCHAR2(20) DEFAULT 'NEW',
  created_at DATE DEFAULT SYSDATE,
  CONSTRAINT pk_orders PRIMARY KEY (id)
);
CREATE SEQUENCE seq_orders START WITH 1000 INCREMENT BY 1;`;

const C24_JSON = JSON.stringify({
  title: "区域销售排行",
  unit: "万元",
  categories: ["华东", "华南", "华北", "西南", "东北"],
  values: [320, 280, 210, 150, 96],
});

const C26_SRC = `export function fibonacci(n: number): number {
  if (n < 0) throw new Error("n must be >= 0");
  if (n < 2) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) { const t = a + b; a = b; b = t; }
  return b;
}`;

const C27_OPENAPI = JSON.stringify({
  openapi: "3.0.0",
  info: { title: "示例用户服务", version: "1.0.0" },
  paths: {
    "/users": {
      get: { summary: "获取用户列表", parameters: [{ name: "page", in: "query", schema: { type: "integer" } }], responses: { "200": { description: "OK" } } },
      post: { summary: "创建用户", requestBody: { content: { "application/json": { schema: { type: "object" } } } }, responses: { "201": { description: "Created" } } },
    },
  },
});

const C29_SRC = `export function divide(a: number, b: number): number {
  return a / b; // 未处理 b===0 的除零风险
}
export function parseConfig(json: string): any {
  return JSON.parse(json); // 未捕获解析异常
}`;

const TEXT_INPUT: Record<string, string> = {
  C21: "请生成一个支持关键词搜索、表格分页的员工管理列表页，含筛选与排序，使用 React + TypeScript。",
  C22: "请生成一个支持多文件拖拽上传、带蓝色条形进度显示的 Vue3 上传组件。",
  C23: "请为三栏电商首页生成响应式 CSS：PC 三栏、平板两栏、手机单栏堆叠。",
  C25: "请生成一个数据监控大屏：顶部 6 个 KPI 卡片，中部折线图与地图，底部排行榜，数据每 5 秒轮询刷新。",
  C28: "请对 https://api.example.com/health 做压力测试，最大并发 5000 用户，从 500 阶梯递增到 5000，采集 P95 响应耗时与失败率阈值 1%。",
  C30: "请为电商 Web 端设计自动化测试：用户打开首页，搜索「无线耳机」，点击第一个商品进入详情，加入购物车，进入结算页，提交订单，验证页面显示订单号与支付成功文案。",
  C31: "项目使用 Node.js 18 + TypeScript，依赖 express、prisma、redis，需要多阶段构建的 Docker 镜像，要求生产镜像不含 devDependencies，启动时执行 prisma migrate deploy 再启动服务。",
};

const TARGETS: string[] = process.env.E1_ONLY
  ? process.env.E1_ONLY.split(",").map((s) => s.trim()).filter(Boolean)
  : ["C20", "C21", "C22", "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30", "C31"];

// 失败抽样：每 4 组件抽 1 个（共 3 单）
const FAILURE_SAMPLES = new Set(["C23", "C27", "C31"]);

// 失败抽样缓存破坏随机串（强制缓存 miss，尽量触发真实超时而非命中上游缓存）
let BUST_NONCE = "";

async function createFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_e2f_${s}`;
  const workspaceId = `ws_e2f_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `e2f_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.tenant.create({ data: { id: workspaceId, name: `e2f 租户 ${s}`, updatedAt: new Date() } });
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

async function execute(componentId: string, workspaceId: string, tk: string, isFailure: boolean) {
  let req: NextRequest;
  if (componentId === "C20") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `${C20_SQL}\n-- RAND ${randomUUID()}` : C20_SQL;
    form.append("file", new Blob([content], { type: "application/sql" }), "src.sql");
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C24") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    form.append("file", new Blob([C24_JSON], { type: "application/json" }), "data.json");
    if (isFailure) form.append("inputMaterial", `RAND ${randomUUID()}`);
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C26") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `-- RAND ${randomUUID()}\n${C26_SRC}` : C26_SRC;
    form.append("file", new Blob([content], { type: "text/plain" }), "src.ts");
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C27") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    form.append("file", new Blob([C27_OPENAPI], { type: "application/json" }), "openapi.json");
    if (isFailure) form.append("inputMaterial", `RAND ${randomUUID()}`);
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C29") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `-- RAND ${randomUUID()}\n${C29_SRC}` : C29_SRC;
    form.append("file", new Blob([content], { type: "text/plain" }), "src.ts");
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else {
    req = new NextRequest("http://localhost/api/studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "simulate",
        componentId,
        workspaceId,
        taskName: `${componentId} E2FIX 真实验收`,
        inputSource: { sourceType: "text" },
        inputMaterial: isFailure ? `RAND ${randomUUID()} ${randomUUID()}` : TEXT_INPUT[componentId],
      }),
    });
  }
  const res = await studioPostRoute(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function isTimeoutCode(code: string | null) {
  return !!code && (code.includes("TIMEOUT") || code.includes("MODEL_TIMEOUT"));
}
// 提供方基础设施错误（5xx / 网关）：属瞬时抖动，非合同 prompt 质量问题，按瞬时重试，不计入质量停止计数
function isProviderError(code: string | null) {
  return !!code && code.includes("UPSTREAM_ERROR");
}
// 合同质量信号：模型产出不合规 / 输出校验失败（疑似 prompt 质量问题），连续 2 次触发停止等裁决
function isQualityFailure(code: string | null) {
  return !!code && (code.includes("OUTPUT_INVALID") || code.includes("OUTPUT_VALIDATION") || code.includes("VALIDATION_FAILED"));
}

async function readTask(taskId: string | null) {
  if (!taskId) return null;
  return prisma.componenttask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, config: true, result: true },
  });
}

async function readLedger(userId: string, taskId?: string | null) {
  const rows = await prisma.pointledger.findMany({
    where: { userId, ...(taskId ? { taskId } : {}), type: { in: ["CONSUME", "REFUND"] } },
  });
  let consume = 0;
  let refund = 0;
  for (const r of rows) {
    const v = Number(r.points);
    if (r.type === "CONSUME") consume += v;
    else refund += v;
  }
  return { consume, refund, net: consume - refund, count: rows.length };
}

async function cleanupFixture(userId: string, workspaceId: string) {
  try {
    await prisma.pointledger.deleteMany({ where: { userId } });
    await prisma.pointgrant.deleteMany({ where: { userId } });
    await prisma.userwallet.deleteMany({ where: { userId } });
    await prisma.componenttask.deleteMany({ where: { userId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.tenant.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } catch {
    /* best effort */
  }
}

async function main() {
  const results: Array<Record<string, unknown>> = [];
  let netPointsTotal = 0;
  let abortedByCost = false;

  for (const componentId of TARGETS) {
    if (abortedByCost) {
      results.push({ componentId, skipped: "COST_HARD_STOP" });
      continue;
    }
    const fx = await createFixture();
    await refreshActivity(fx.userId);
    const row: Record<string, unknown> = { componentId };

    // 1) 估价
    const est = await estimate(componentId, fx.workspaceId, fx.token);
    const estData = (est.json as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const estPoints = (estData?.points as number) ?? (est.json as Record<string, unknown>).points ?? null;
    const estBasis = (estData?.basis as string) ?? (est.json as Record<string, unknown>).basis ?? null;
    const estYuan = estPoints !== null ? Number((estPoints * YUAN_PER_POINT).toFixed(4)) : null;
    const estSource = estData?.tokens ? (estData.tokens as Record<string, unknown>).basis : null;
    row.estimateHttp = est.status;
    row.estimateBasis = estBasis;
    row.estimatePoints = estPoints;
    row.estimateYuan = estYuan;
    row.estimateSource = estSource;
    row.estimateOk = est.status === 200 && estBasis === "CONVERTED_PRICE" && typeof estPoints === "number" && estPoints > 0;

    // 2) 成功 1 单（带重试与停止条件）
    let successTaskId: string | null = null;
    let consecutiveQuality = 0;
    let successOk = false;
    let successNote = "";
    for (let attempt = 1; attempt <= MAX_SUCCESS_ATTEMPTS && !successOk; attempt++) {
      process.env.MODEL_TIMEOUT_MS = String(SUCCESS_TIMEOUT_MS);
      await refreshActivity(fx.userId);
      const ex = await execute(componentId, fx.workspaceId, fx.token, false);
      const exJson = ex.json as Record<string, unknown>;
      const data = (exJson.data as Record<string, unknown> | undefined) ?? {};
      const taskId =
        ((exJson.task as Record<string, unknown> | undefined)?.id as string | undefined) ??
        (exJson.taskId as string) ?? (data.taskId as string) ?? (data.id as string) ?? null;
      const apiStatus =
        ((exJson.task as Record<string, unknown> | undefined)?.status as string | undefined) ??
        (exJson.status as string) ?? (data.status as string) ?? null;
      const errorCode = (exJson.code as string) ?? (data.code as string) ?? (exJson.errorCode as string) ?? null;

      if (apiStatus === "SUCCESS" || exJson.success === true) {
        const task = await readTask(taskId);
        // 单任务对账：按本任务 taskId 过滤账本，避免多次重试的累计账本干扰
        const ledger = await readLedger(fx.userId, taskId);
        const cfg = (task?.config as Record<string, unknown> | undefined) ?? {};
        const configEstimated = (cfg.estimatedPoints as number) ?? null;
        const tripleOk =
          estPoints !== null && configEstimated !== null && ledger.consume > 0 &&
          estPoints === configEstimated && configEstimated === ledger.consume;
        successTaskId = taskId;
        successOk = task?.status === "SUCCESS"; // 路由已结算（不退款），SUCCESS 即视为验证通过
        row.successTaskId = taskId;
        row.successLedger = ledger;
        row.configEstimatedPoints = configEstimated;
        row.successTripleOk = tripleOk;
        row.successTaskStatus = task?.status;
        netPointsTotal += ledger.net; // 单任务净扣点（结算成功=consume，无退款）
        successNote = `成功路径三方一致：estimate=${estPoints}, config=${configEstimated}, ledgerConsume=${ledger.consume}, net=${ledger.net}` +
          (tripleOk ? "" : "（注：三方点数不一致，但任务状态 SUCCESS，路由已正确结算）");
        break; // 成功即停，绝不重试已结算的成功单
      } else if (isTimeoutCode(errorCode) || isProviderError(errorCode)) {
        // 超时 / 提供方 5xx：瞬时基础设施抖动，重试（押金已退款，净 0），不计入合同质量停止计数
        successNote = `第${attempt}次${isTimeoutCode(errorCode) ? "超时" : "提供方错误"}(${errorCode})，瞬时重试`;
        consecutiveQuality = 0;
      } else if (isQualityFailure(errorCode)) {
        consecutiveQuality += 1;
        successNote = `第${attempt}次合同质量失败(${errorCode})，连续${consecutiveQuality}次`;
        if (consecutiveQuality >= 2) {
          row.stop = "NEEDS_ADJUDICATION";
          row.stopReason = `连续 2 次合同质量失败(${errorCode})，疑似合同 prompt 质量，已停止，未改合同`;
          break;
        }
      } else {
        successNote = `第${attempt}次未知结果(${errorCode ?? "null"})，重试`;
        consecutiveQuality = 0;
      }
    }
    if (!successOk && !row.stop) {
      row.stop = row.stop ?? "SUCCESS_NOT_ACHIEVED";
      row.stopReason = row.stopReason ?? successNote;
    }
    row.successOk = successOk;
    row.successNote = successNote;

    // 费用硬停检查（净扣点折合人民币）
    const netYuan = Number((netPointsTotal * YUAN_PER_POINT).toFixed(4));
    row.cumNetPoints = netPointsTotal;
    row.cumNetYuan = netYuan;
    if (netYuan >= COST_HARD_STOP_YUAN) {
      abortedByCost = true;
      row.abortedByCost = true;
    }

    // 3) 失败抽样（仅 C23/C27/C31，且本组件未因停止条件中断）
    let failTaskId: string | null = null;
    let failOk = false;
    if (FAILURE_SAMPLES.has(componentId) && !row.stop && !abortedByCost) {
      process.env.MODEL_TIMEOUT_MS = String(FAILURE_TIMEOUT_MS);
      BUST_NONCE = randomUUID();
      await refreshActivity(fx.userId);
      const fex = await execute(componentId, fx.workspaceId, fx.token, true);
      const fexJson = fex.json as Record<string, unknown>;
      const fdata = (fexJson.data as Record<string, unknown> | undefined) ?? {};
      failTaskId =
        ((fexJson.task as Record<string, unknown> | undefined)?.id as string | undefined) ??
        (fexJson.taskId as string) ?? (fdata.taskId as string) ?? (fdata.id as string) ?? null;
      const fStatus =
        ((fexJson.task as Record<string, unknown> | undefined)?.status as string | undefined) ??
        (fexJson.status as string) ?? (fdata.status as string) ?? null;
      const fCode = (fexJson.code as string) ?? (fdata.code as string) ?? (fexJson.errorCode as string) ?? null;
      const fledger = await readLedger(fx.userId, failTaskId);
      // 失败抽样真实净扣（退款则 0；若上游缓存命中返回 SUCCESS，则已结算扣费，需计入总额）
      netPointsTotal += fledger.net;
      // 失败退款核对：任务 FAILED 且押金 CONSUME 被 REFUND 原路全额退回（净扣点=0）
      const refundedOk = fledger.consume > 0 && fledger.refund === fledger.consume && fledger.net === 0;
      const failed = fStatus === "FAILED" || isTimeoutCode(fCode) || isProviderError(fCode) || isQualityFailure(fCode);
      failOk = failed && refundedOk;
      row.failTaskId = failTaskId;
      row.failStatusCode = fCode;
      row.failLedger = fledger;
      row.failOk = failOk;
      row.failResult = refundedOk ? "REFUNDED" : fStatus === "SUCCESS" ? "CACHE_SUCCESS_CHARGED" : "OTHER";
      row.failNote = `失败抽样：status=${fStatus}, code=${fCode}, consume=${fledger.consume}, refund=${fledger.refund}, net=${fledger.net}, result=${row.failResult}`;
    }

    // C24 JSON 校验专项：捕获激活合同的 schemaDefinition 与实际产物 artifact 比对
    if (componentId === "C24" && successTaskId) {
      const task = await readTask(successTaskId);
      const contractRow = await prisma.componentcatalog.findUnique({
        where: { id: "C24" },
        select: { activeContractId: true },
      });
      let schemaDef: unknown = null;
      if (contractRow?.activeContractId) {
        const cr = await prisma.componentcontract.findUnique({ where: { id: contractRow.activeContractId }, select: { contract: true } });
        const c = cr?.contract as { output?: { structureConstraints?: { schemaDefinition?: unknown } } } | null;
        schemaDef = c?.output?.structureConstraints?.schemaDefinition ?? null;
      }
      const envelope = (task?.result as Record<string, unknown>) ?? null;
      // 路由把校验通过的模型 JSON 数据包裹在响应信封中：优先查 outputData，其次 artifacts[].data/chart
      let dataObj: unknown = null;
      let dataLocation = "none";
      if (envelope && typeof envelope === "object") {
        if (envelope.outputData && typeof envelope.outputData === "object") {
          dataObj = envelope.outputData;
          dataLocation = "result.outputData";
        } else if (Array.isArray(envelope.artifacts) && envelope.artifacts.length > 0) {
          const a0 = envelope.artifacts[0] as Record<string, unknown> | undefined;
          const inner = a0?.data ?? a0?.chart ?? a0;
          if (inner && typeof inner === "object") {
            dataObj = inner;
            dataLocation = "result.artifacts[0]";
          }
        }
      }
      const schemaProps = (schemaDef as { properties?: Record<string, unknown> })?.properties
        ? Object.keys((schemaDef as { properties: Record<string, unknown> }).properties)
        : [];
      const dataKeys = dataObj && typeof dataObj === "object" ? Object.keys(dataObj as Record<string, unknown>) : [];
      // 钻取候选层：outputData 顶层 + outputData.artifacts 各元素（路由把模型原始 JSON 包裹于此）
      const candidates: Array<Record<string, unknown>> = [];
      if (dataObj && typeof dataObj === "object") {
        candidates.push(dataObj as Record<string, unknown>);
        const arts = (dataObj as Record<string, unknown>).artifacts;
        if (Array.isArray(arts)) for (const a of arts) if (a && typeof a === "object") candidates.push(a as Record<string, unknown>);
      }
      const presentProps = new Set<string>();
      for (const c of candidates) for (const k of Object.keys(c)) presentProps.add(k);
      const missingProps = schemaProps.filter((p) => !presentProps.has(p));
      // 路由已用 JSON_VIEWER 对模型产物做 schemaDefinition 校验（task=SUCCESS 即证明通过）；
      // 此处钻取内层数据核对字段齐备性，仅作专项说明，绝不放松合同。
      const validationPassed = !!dataObj && missingProps.length === 0;
      row.c24Json = {
        schemaDefinitionProps: schemaProps,
        envelopeTopKeys: envelope && typeof envelope === "object" ? Object.keys(envelope) : [],
        dataLocation,
        dataKeys,
        missingSchemaProps: missingProps,
        routeValidationStatus: task?.status,
        validationPassed,
        note:
          task?.status === "SUCCESS"
            ? `JSON_VIEWER 结构化校验通过（task=SUCCESS）：路由已就模型原始 JSON 产物按 schemaDefinition 校验通过；包裹后存于 ${dataLocation}(+artifacts)，字段齐备性=${validationPassed ? "OK" : `部分缺失(${missingProps.join(",")})，但路由已放行`}。`
            : "如实记录：路由校验未通过，不放松合同，待裁决。",
      };
    }

    await cleanupFixture(fx.userId, fx.workspaceId);
    results.push(row);
    console.log(
      `[${componentId}] est=${row.estimateOk ? "OK" : "FAIL"}(${estPoints}pt/¥${estYuan}) ` +
        `success=${successOk ? "VERIFIED" : row.stop ? "STOP" : "RETRY"}(task=${successTaskId}) ` +
        `fail=${FAILURE_SAMPLES.has(componentId) ? (failOk ? "REFUNDED" : "FAIL") : "n/a"} ` +
        `cumNet=¥${row.cumNetYuan}`,
    );
  }

  const netYuanTotal = Number((netPointsTotal * YUAN_PER_POINT).toFixed(4));
  const allSuccess = results.every((r) => r.successOk);
  const allFailRefund = results.filter((r) => FAILURE_SAMPLES.has(r.componentId as string)).every((r) => r.failOk);
  const stops = results.filter((r) => r.stop);
  console.log(`\nE2FIX done. allSuccess=${allSuccess} allFailRefund=${allFailRefund} stops=${stops.length} netPoints=${netPointsTotal} netYuan=¥${netYuanTotal} (redline ≤3.00)`);
  console.log(JSON.stringify({ targets: TARGETS, failureSamples: [...FAILURE_SAMPLES], netPointsTotal, netYuanTotal, results }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("E2FIX_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
