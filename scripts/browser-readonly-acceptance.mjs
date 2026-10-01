// 浏览器只读验收（批次 CORE-3-GOLDEN-PATH-FINAL-CLOSURE 第六节 H）
// 真实 UI 登录（不伪造 JWT），仅做只读查询：/tasks、/studio 页面加载，
// 以及通过浏览器已认证会话消费真实 task_detail（SUCCESS 与 FAILED 各一）。
// 凭据来自环境变量（TEST_ACCOUNT / TEST_PWD），绝不硬编码、绝不回显。
import { chromium } from "playwright";

const BASE = process.env.ACCEPT_BASE || "http://127.0.0.1:3000";
const ACCOUNT = process.env.TEST_ACCOUNT;
const PASSWORD = process.env.TEST_PWD;
const SUCCESS_TASK = process.env.ACCEPT_SUCCESS_TASK || "ddfb3ed7-e34e-4dbf-96a3-805ba23edb29"; // C07 SUCCESS
const FAILED_TASK = process.env.ACCEPT_FAILED_TASK || "ae9e89dc-4e3a-49aa-82ac-c5badbc87243"; // C07 FAILED

if (!ACCOUNT || !PASSWORD) { console.error("MISSING_CREDS"); process.exit(2); }

const out = [];
function log(s) { out.push(s); console.log(s); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR:" + e.message));

  // 真实会话：通过真实 /api/auth/login 端点换取（不伪造 JWT），再以受控 Cookie 注入浏览器上下文
  await page.goto(`${BASE}/studio`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const loginStatus = await page.evaluate(async (creds) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ account: creds.a, password: creds.p, rememberMe: true }),
    });
    return r.status;
  }, { a: ACCOUNT, p: PASSWORD });
  log("API_LOGIN_STATUS=" + loginStatus);
  if (loginStatus !== 200) { log("LOGIN_FAILED"); await browser.close(); process.exit(2); }
  log("LOGIN_DONE (cookie session injected)");

  // 只读页面加载
  for (const path of ["/tasks", "/studio"]) {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    log(`PAGE ${path} status=${resp ? resp.status() : "n/a"}`);
  }

  // 浏览器侧消费真实 task_detail（已认证会话）
  async function checkDetail(label, taskId) {
    const data = await page.evaluate(async (tid) => {
      const r = await fetch(`/api/studio?action=task_detail&taskId=${encodeURIComponent(tid)}`, { credentials: "include" });
      return { status: r.status, json: await r.json() };
    }, taskId);
    const t = data.json.data || {};
    const rawOutputLeak = "outputData" in t && t.outputData && typeof t.outputData === "object" && (t.outputData.error || t.outputData.message);
    log(`DETAIL ${label} http=${data.status} status=${t.status} errorCode=${t.errorCode} refundStatus=${t.refundStatus} chargeAttempted=${t.chargeAttempted} hasContractView=${!!t.contractView} artifactCount=${Array.isArray(t.artifacts) ? t.artifacts.length : 0} rawOutputLeak=${!!rawOutputLeak}`);
    return { http: data.status, status: t.status, rawOutputLeak: !!rawOutputLeak };
  }
  const okS = await checkDetail("SUCCESS", SUCCESS_TASK);
  const okF = await checkDetail("FAILED", FAILED_TASK);

  log("CONSOLE_ERRORS=" + consoleErrors.length);
  consoleErrors.slice(0, 10).forEach((e, i) => log("  CONSOLE_ERR[" + i + "]=" + e.slice(0, 200)));
  await browser.close();

  const pass = okS.http === 200 && okS.status === "SUCCESS" && okS.rawOutputLeak === false &&
    okF.http === 200 && okF.status === "FAILED" && okF.rawOutputLeak === false;
  log("BROWSER_ACCEPT_PASS=" + pass);
  process.exit(pass ? 0 : 2);
}
main().catch((e) => { console.error("BROWSER_ERR", e && e.message ? e.message : String(e)); process.exit(2); });
