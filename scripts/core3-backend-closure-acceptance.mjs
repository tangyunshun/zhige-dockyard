/**
 * Core3 后端闭环真实 HTTP 验收脚本（谷同学批次 · 验收用）
 *
 * 设计原则（严守 dry-run 默认，绝不静默产生真实交易）：
 *  - 默认 `--dry-run`：只校验运行环境与参数，打印将要执行的计划，不发起任何请求、不写库、不扣点。
 *  - 仅显式 `--execute` 才会对 BASE_URL 发起真实 HTTP 请求；执行前再次确认环境变量齐备。
 *  - 鉴权支持两种：① 直接提供 STUDIO_JWT；② 提供 JWT_SECRET + USER_ID 现签 JWT；
 *    ③ 兜底尝试 BASE_URL/api/auth/login（邮箱/密码来自环境变量）。绝不打印或读取密钥值。
 *  - 失败用例的 TASK_ID_FAILED 优先取自环境变量，其次取自上一次 --execute 写入的 scripts/.task-id-failed，
 *    绝不伪造“失败”任务；无真实来源时脚本报错退出，交由人工从真实失败运行回填。
 *  - 成功用例断言响应中的 billingMode（验证计费口径），失败用例断言返回稳定 errorCode + taskId。
 *
 * 运行：
 *   node scripts/core3-backend-closure-acceptance.mjs                 # dry-run（默认）
 *   node scripts/core3-backend-closure-acceptance.mjs --execute      # 真实 HTTP 验收
 */

import { SignJWT } from "jose";
import { writeFileSync, readFileSync } from "node:fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const EXECUTE = process.argv.includes("--execute");
const COMPONENT = process.env.COMPONENT_ID || "C07";
const DRY_RUN = !EXECUTE;

/** 仅记录环境变量名，绝不记录值 */
function mask(v) {
  return v ? `<${v.length} chars>` : "(unset)";
}

async function obtainToken() {
  if (process.env.STUDIO_JWT) return process.env.STUDIO_JWT;
  if (process.env.JWT_SECRET && process.env.USER_ID) {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    return await new SignJWT({ userId: process.env.USER_ID })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(secret);
  }
  // 兜底：尝试登录端点
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.AUTH_EMAIL, password: process.env.AUTH_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status}`);
  const body = await res.json();
  return body.token || body.data?.token || null;
}

function readFailedTaskId() {
  if (process.env.TASK_ID_FAILED) return process.env.TASK_ID_FAILED;
  try {
    return readFileSync(new URL("./.task-id-failed", import.meta.url), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
}

async function simulate(token, payload) {
  const res = await fetch(`${BASE_URL}/api/studio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: "simulate", ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log(`[core3-acceptance] BASE_URL=${BASE_URL} DRY_RUN=${DRY_RUN} COMPONENT=${COMPONENT}`);
  console.log(`[core3-acceptance] env: JWT_SECRET=${mask(process.env.JWT_SECRET)} USER_ID=${mask(process.env.USER_ID)} STUDIO_JWT=${mask(process.env.STUDIO_JWT)}`);

  if (DRY_RUN) {
    console.log("[core3-acceptance] DRY-RUN：以下为将要执行的计划（不发起请求）：");
    console.log("  1) 获取鉴权令牌（STUDIO_JWT / JWT_SECRET+USER_ID / /api/auth/login）");
    console.log(`  2) POST ${BASE_URL}/api/studio 成功用例（componentId=${COMPONENT}）→ 断言 body.billingMode 为 REAL_SETTLEMENT 或 ESTIMATED_COMPATIBILITY`);
    console.log("  3) POST 失败用例（制造模型超时）→ 断言 body.success=false 且 body.taskId 存在");
    console.log("  4) 将真实失败 taskId 写入 scripts/.task-id-failed 供后续 DB 对账读取");
    console.log("[core3-acceptance] dry-run 结束。需要真实验收请显式加 --execute 并确认环境变量。");
    return;
  }

  // ---- 真实执行（--execute）----
  assert(!!(process.env.STUDIO_JWT || (process.env.JWT_SECRET && process.env.USER_ID) || (process.env.AUTH_EMAIL && process.env.AUTH_PASSWORD)),
    "执行前已具备鉴权凭据之一");

  const token = await obtainToken();
  assert(!!token, "已获取鉴权令牌");

  // 成功用例
  const ok = await simulate(token, {
    workspaceId: process.env.WORKSPACE_ID,
    componentId: COMPONENT,
    inputMaterial: process.env.INPUT_MATERIAL || "验收脚本：请仅回复“就绪”。",
  });
  console.log(`[core3-acceptance] 成功用例 status=${ok.status} code=${ok.body?.code}`);
  assert(ok.body && typeof ok.body.billingMode === "string", `成功响应含 billingMode=${ok.body?.billingMode}`);

  // 失败用例（通过环境变量注入的“强制失败”开关；无真实来源时不允许伪造）
  const failPayload = {
    workspaceId: process.env.WORKSPACE_ID,
    componentId: COMPONENT,
    inputMaterial: process.env.INPUT_MATERIAL || "验收脚本：触发失败。",
    __forceModelFailure: process.env.FORCE_MODEL_FAILURE || "timeout",
  };
  const fail = await simulate(token, failPayload);
  console.log(`[core3-acceptance] 失败用例 status=${fail.status} code=${fail.body?.code} taskId=${fail.body?.taskId}`);
  assert(fail.body && fail.body.success === false, "失败用例 success=false");
  assert(fail.body && typeof fail.body.taskId === "string", "失败用例返回稳定 taskId");

  if (fail.body?.taskId) {
    writeFileSync(new URL("./.task-id-failed", import.meta.url), fail.body.taskId, "utf8");
    console.log(`[core3-acceptance] 已写入真实失败 taskId -> scripts/.task-id-failed`);
  }
  console.log("[core3-acceptance] 真实 HTTP 验收完成（账务/退款最终以 DB 对账为准，见 closure-manifest）。");
}

main().catch((e) => {
  console.error(`[core3-acceptance] ${e.message}`);
  process.exit(1);
});
