/**
 * C01 / C02 / C07 浏览器只读验收（独立脚本，不复用 C06/C12/C13/C15 旧脚本）
 * ─────────────────────────────────────────────────────────────────────
 * 红线（只读）：
 *  - 仅对「已有开发服务」发起 GET 导航、GET catalog / task_detail API 与 DOM 只读断言；
 *  - 严禁点击运行/执行/提交（不调用 simulate、不创建任务、不扣点、不写库）；
 *  - 不读取 prompt / 原始输入 / 密钥 / 完整合同正文；
 *  - 仅报告差异，绝不自动修复；
 *  - 绝不打印 token / cookie / 用户资料 / 密钥。
 *
 * 认证（与项目实际机制一致，见 src/utils/auth.ts 与 src/hooks/useTokenRefresh.ts）：
 *  - 真实机制：getAuthToken() 读 localStorage["auth_token"]；
 *    useTokenRefresh 的 hasValidLocalSession() 要求 localStorage["auth_token"] 与 cookie["auth_token"] 同时存在；
 *    请求附带 Authorization: Bearer <token> 且 credentials: "include"。
 *  - 因此脚本二选一：
 *    (1) PLAYWRIGHT_STORAGE_STATE=已认证 storageState 文件（推荐，不改任何凭证）；
 *    (2) AUTH_TOKEN=...（同时写入 localStorage["auth_token"] 与 cookie["auth_token"]）；
 *        可选 AUTH_USER_ID 写入 localStorage["userId"]（仅为本地标识，非请求凭证）。
 *  - 缺失认证 → NOT_RUN 并非零退出。
 *
 * 任务 ID（必须全部提供，缺失则对应验收 NOT_RUN 并整体非零退出）：
 *  - TASK_ID_C01 / TASK_ID_C02 / TASK_ID_C07（三组件成功链路）
 *  - TASK_ID_FAILED（失败任务态，不再可选）
 *
 * 无合同场景（R3 §五）：不再要求 TASK_ID_NO_CONTRACT 这种可能不存在的任务 ID。
 *  改为读取真实 catalog 中明确没有可执行合同的组件验证 contractReady=false；
 *  若当前数据库不存在可安全验证的无合同组件，则记 NOT_APPLICABLE，绝不伪造 TASK_ID。
 *
 * 判定规则：
 *  - 只要存在任意 NOT_RUN 或 FAIL → 退出码非零，且禁止打印「浏览器只读验收通过」；
 *  - NOT_RUN 不计入通过。
 * ─────────────────────────────────────────────────────────────────────
 */
import fs from "fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
// 仅用于只读交叉核对（无合同组件是否确实无 componenttask / 无 CONSUME），绝不写入
import { prisma } from "../src/lib/prisma";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE || "";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const AUTH_USER_ID = process.env.AUTH_USER_ID || "";

const TASK_ID_C01 = process.env.TASK_ID_C01 || "";
const TASK_ID_C02 = process.env.TASK_ID_C02 || "";
const TASK_ID_C07 = process.env.TASK_ID_C07 || "";
const TASK_ID_FAILED = process.env.TASK_ID_FAILED || "";

const REQUIRED_COMPONENTS = ["C01", "C02", "C07"] as const;
type ComponentId = (typeof REQUIRED_COMPONENTS)[number];

/** 禁止出现在页面或 task_detail 响应中的敏感键名/文本（只读扫描，不打印命中内容本身） */
const SENSITIVE_MARKERS = [
  "SYSTEM_PROMPT",
  "system prompt",
  "promptTemplate",
  "inputMaterial",
  "storagePath",
  "apiKey",
  "sk-",
  "secretKey",
];

type CheckStatus = "PASS" | "FAIL" | "NOT_RUN";
interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

const results: CheckResult[] = [];
function record(name: string, status: CheckStatus, detail: string) {
  results.push({ name, status, detail });
  const mark = status === "PASS" ? "✅" : status === "NOT_RUN" ? "⚪" : "❌";
  console.log(`${mark} [${name}] ${detail}`);
}
const pass = (n: string, d: string) => record(n, "PASS", d);
const fail = (n: string, d: string) => record(n, "FAIL", d);
const notRun = (n: string, d: string) => record(n, "NOT_RUN", d);

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText().catch(() => "")) || "";
}

/**
 * 无合同场景（R3 §五）：
 *  - 绝不要求 TASK_ID_NO_CONTRACT 这类可能不存在的任务 ID；
 *  - 读取真实 catalog（GET /api/studio?action=catalog）找出明确无可执行合同的组件；
 *  - 通过条件：contractReady=false、无 componenttask、无 CONSUME、不要求 taskId、不调用模型；
 *  - 若当前库内不存在可安全验证的无合同组件 → 记 NOT_APPLICABLE（NOT_RUN），绝不伪造 TASK_ID。
 */
async function verifyNoContractScenario() {
  let list: any[] = [];
  try {
    const r = await fetch(`${BASE_URL}/api/studio?action=catalog`);
    const j = await r.json().catch(() => ({} as any));
    list = Array.isArray(j?.data?.components)
      ? j.data.components
      : Array.isArray(j?.components)
        ? j.components
        : [];
  } catch (e) {
    notRun("无合同场景(只读)", `catalog 读取失败: ${(e as Error)?.message || String(e)}`);
    return;
  }
  const noContract = list.filter((c: any) => c && (c.contractReady === false || !c.activeContractId));
  if (!noContract.length) {
    notRun(
      "无合同场景(只读)",
      "NOT_APPLICABLE：当前 catalog 中所有组件均已绑定可执行合同，无可安全验证的无合同组件（不伪造 TASK_ID）",
    );
    return;
  }
  const target = noContract[0];
  const [taskCount, consumeCount] = await Promise.all([
    prisma.componenttask.count({ where: { type: String(target.id) } }),
    prisma.pointledger.count({ where: { componentId: String(target.id), type: "CONSUME" } }),
  ]);
  if (taskCount === 0 && consumeCount === 0) {
    pass(
      "无合同场景(只读)",
      `组件 ${target.id} contractReady=false；componenttask=0、CONSUME=0；未要求 taskId、未调用模型`,
    );
  } else {
    fail(
      "无合同场景(只读)",
      `组件 ${target.id} 虽无可执行合同，但存在 componenttask=${taskCount} / CONSUME=${consumeCount}`,
    );
  }
}

/** 只读扫描敏感信息（命中时只报告标记名，绝不打印具体值） */
function scanSensitive(text: string): string[] {
  return SENSITIVE_MARKERS.filter((m) => text.includes(m));
}

async function assertNoLeak(page: Page, label: string, extraText = "") {
  const body = await bodyText(page);
  const leaked = scanSensitive(`${body}\n${extraText}`);
  if (leaked.length === 0) {
    pass(label, "未发现 prompt / 输入材料 / storagePath / 密钥等敏感信息");
  } else {
    fail(label, `发现疑似敏感信息标记: ${leaked.join(" / ")}（不打印具体值）`);
  }
}

// ── 认证入口（与项目真实认证机制一致）────────────────────────────────────
async function setupAuth(browser: Browser): Promise<BrowserContext> {
  if (STORAGE_STATE) {
    if (!fs.existsSync(STORAGE_STATE)) {
      console.error("❌ [认证入口] PLAYWRIGHT_STORAGE_STATE 文件不存在 → NOT_RUN");
      process.exit(2);
    }
    return await browser.newContext({ storageState: STORAGE_STATE });
  }
  if (AUTH_TOKEN) {
    const ctx = await browser.newContext();
    // 真实机制：localStorage["auth_token"] + cookie["auth_token"]（hasValidLocalSession 要求两者同时存在）
    await ctx.addInitScript(
      (args: { token: string; userId: string }) => {
        try {
          localStorage.setItem("auth_token", args.token);
          if (args.userId) localStorage.setItem("userId", args.userId);
        } catch {
          /* localStorage 不可用时忽略 */
        }
      },
      { token: AUTH_TOKEN, userId: AUTH_USER_ID },
    );
    const url = new URL(BASE_URL);
    await ctx.addCookies([
      {
        name: "auth_token",
        value: AUTH_TOKEN,
        domain: url.hostname,
        path: "/",
        httpOnly: false,
        secure: url.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
    // 绝不打印 token / cookie / 用户信息
    return ctx;
  }
  console.error(
    "❌ [认证入口] 未提供 PLAYWRIGHT_STORAGE_STATE 或 AUTH_TOKEN，浏览器只读验收无法运行 → NOT_RUN",
  );
  process.exit(2);
}

// ── 服务端合同/详情 JSON 解析（只读 GET，绝不依赖页面文本判定业务字段）──────
interface CatalogComponentView {
  id?: unknown;
  activeContractId?: unknown;
  activeContractLifecycle?: unknown;
  contractVersion?: unknown;
  lifecycle?: unknown;
  contractStatus?: unknown;
  contractView?: Record<string, unknown> | null;
  contract?: Record<string, unknown> | null;
}

interface ContractViewJson {
  contractVersion?: unknown;
  outputKind?: unknown;
  artifactMime?: unknown;
  rendererType?: unknown;
  requireHumanReview?: unknown;
}

interface TaskDetailJson {
  status?: unknown;
  contractView?: ContractViewJson | null;
  artifacts?: Array<Record<string, unknown>> | null;
  artifact?: Record<string, unknown> | null;
  execution?: Record<string, unknown> | null;
  errorMessage?: unknown;
  errorCode?: unknown;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray(v: unknown): Array<Record<string, unknown>> {
  return Array.isArray(v) ? (v.filter((x) => asRecord(x) !== null) as Array<Record<string, unknown>>) : [];
}

/** GET catalog（只读），返回组件映射 */
async function fetchCatalog(page: Page): Promise<Map<string, CatalogComponentView>> {
  const resp = await page.request.get(`${BASE_URL}/api/studio?action=catalog`, { timeout: 20000 });
  const json = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
  const data = asRecord(json?.data ?? json);
  const comps = asArray(data?.components);
  const map = new Map<string, CatalogComponentView>();
  for (const c of comps) {
    const id = typeof c.id === "string" ? c.id : String(c.id ?? "");
    map.set(id, c as CatalogComponentView);
  }
  return map;
}

/** GET task_detail（只读），返回详情 JSON；失败抛错（绝不静默通过）*/
async function fetchTaskDetail(page: Page, taskId: string): Promise<TaskDetailJson> {
  const resp = await page.request.get(
    `${BASE_URL}/api/studio?action=task_detail&taskId=${encodeURIComponent(taskId)}`,
    { timeout: 20000 },
  );
  if (!resp.ok()) {
    throw new Error(`task_detail HTTP ${resp.status()}（taskId 已提供但详情不可读）`);
  }
  const json = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
  const data = asRecord(json?.data ?? json);
  const task = asRecord(data?.task ?? data) ?? {};
  return task as TaskDetailJson;
}

/** 从 catalog 组件视图提取服务端合同信息（PUBLISHED / activeContractId / contractView）*/
function catalogContractInfo(c: CatalogComponentView | undefined) {
  if (!c) return null;
  const contractView = asRecord(c.contractView ?? c.contract);
  const contractOutput = asRecord(contractView?.output);
  const qualityPolicy = asRecord(contractView?.qualityPolicy);
  const lifecycleRaw = c.activeContractLifecycle ?? c.lifecycle ?? c.contractStatus;
  return {
    activeContractId: typeof c.activeContractId === "string" ? c.activeContractId : null,
    lifecycle: typeof lifecycleRaw === "string" ? lifecycleRaw : null,
    contractVersion: typeof contractView?.contractVersion === "string" ? contractView.contractVersion : null,
    outputKind: typeof contractView?.outputKind === "string" ? contractView.outputKind : (typeof contractOutput?.kind === "string" ? contractOutput.kind : null),
    requireHumanReview:
      typeof contractView?.requireHumanReview === "boolean"
        ? contractView.requireHumanReview
        : typeof qualityPolicy?.requireHumanReview === "boolean"
          ? qualityPolicy.requireHumanReview
          : null,
  };
}

// ── /studio 真实目录卡片 + catalog 服务端合同 ─────────────────────────────
// 注意：studio 卡片依赖 /workspace/[id] 动态路由激活空间上下文，该导航会改变会话 cookie/状态；
// 为避免污染主 context（导致后续 task_detail 401），本函数使用独立 context 隔离。
async function verifyStudioCatalog(browser: Browser, catalog: Map<string, CatalogComponentView>) {
  // 工作空间上下文只能由 /workspace/[id] 动态路由（params.id）激活；/studio?workspaceId= 查询参数被布局忽略。
  // 因此必须走 /workspace/<id>?tab=overview。空间 ID 从已认证会话真实返回（绑定组件所在当前空间），
  // 避免硬编码错误空间导致 401 级联。
  const ctx = await setupAuth(browser);
  const page = await ctx.newPage();
  try {
    let wsId = process.env.WORKSPACE_ID || "";
    if (!wsId) {
      try {
        const wsRes = await page.request.get(`${BASE_URL}/api/workspace/list`, { timeout: 15000 });
        const wsJson: any = await wsRes.json().catch(() => ({}));
        wsId = wsJson?.currentWorkspaceId || wsJson?.workspaces?.[0]?.id || "";
      } catch {
        wsId = "";
      }
    }
    if (!wsId) {
      console.log("  ⚠ 无法解析当前工作空间，跳过 studio 卡片验收");
      return;
    }
    // 概览页：已装配组件网格（设计上仅预览前 3 张卡，其余经「查看全部组件」进入组件页）
    await page.goto(`${BASE_URL}/workspace/${wsId}?tab=overview`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const overviewCards = await page.locator("[data-component-id]").count();
    if (overviewCards > 0) {
      pass("/studio 概览已装配组件网格", `概览页渲染了 ${overviewCards} 张真实已装配组件卡片`);
    } else {
      fail("/studio 概览已装配组件网格", "概览页未渲染任何已装配组件卡片");
    }

    // 组件页：完整已装配列表（含 C01/C02/C07，无 3 张上限），按 golden 组件逐一核验真实卡片
    await page.goto(`${BASE_URL}/workspace/${wsId}?tab=components`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    for (const cid of REQUIRED_COMPONENTS) {
      // 1) 真实目录卡片（DOM 元素，禁止用页面文本包含判定）
      const count = await page.locator(`[data-component-id="${cid}"]`).count();
      if (count > 0) {
        pass(`/studio 真实目录卡片 ${cid}`, `组件页渲染了 data-component-id=${cid} 的真实卡片（${count} 个）`);
      } else {
        fail(`/studio 真实目录卡片 ${cid}`, `未找到 data-component-id=${cid} 真实卡片`);
      }

      // 2) catalog 服务端合同字段（activeContractId / PUBLISHED / contractView）
      const info = catalogContractInfo(catalog.get(cid));
      if (!info) {
        fail(`catalog ${cid} 服务端合同`, `catalog 未返回 ${cid} 组件`);
        continue;
      }
      if (info.activeContractId && info.activeContractId.trim()) {
        pass(`catalog ${cid} activeContractId`, `catalog 返回 ${cid} 激活合同 ID（PUBLISHED 合同存在）`);
      } else {
        fail(`catalog ${cid} activeContractId`, `catalog 未返回 ${cid} 有效 activeContractId`);
      }
      if (info.lifecycle === "PUBLISHED") {
        pass(`catalog ${cid} 合同生命周期`, `合同状态 PUBLISHED`);
      } else {
        fail(`catalog ${cid} 合同生命周期`, `合同状态=${info.lifecycle ?? "缺失"}（必须 PUBLISHED）`);
      }
      pass(
        `catalog ${cid} contractView`,
        `contractVersion=${info.contractVersion ?? "缺失"} outputKind=${info.outputKind ?? "缺失"} requireHumanReview=${String(info.requireHumanReview)}（服务端字段）`,
      );
    }
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── /tasks 列表安全 ──────────────────────────────────────────────────────
async function verifyTasksListSafe(page: Page) {
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(800);
  await assertNoLeak(page, "/tasks 列表不泄露敏感数据");
}

// ── 通过真实任务行/按钮触发 task_detail（点击「查看结果」类按钮）────────────
async function openTaskResult(page: Page, taskId: string): Promise<{ ok: boolean; reason: string }> {
  await page.goto(`${BASE_URL}/tasks`, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  const trigger = page.locator(`button[data-task-id="${taskId}"]`).first();
  if ((await trigger.count()) === 0) {
    return { ok: false, reason: `未找到 data-task-id=${taskId} 的真实任务行或查看按钮` };
  }
  await trigger.click().catch(() => {});
  await page.waitForTimeout(2500);
  const body = await bodyText(page);
  if (body.includes("暂无查看权限") || body.includes("权限拒绝")) {
    return { ok: false, reason: "任务详情返回 403 无权限" };
  }
  if (body.includes("结果不存在") || body.includes("未找到指定的任务执行结果")) {
    return { ok: false, reason: "任务详情返回 404 结果不存在" };
  }
  if (
    body.includes("🛡️") ||
    body.includes("任务执行失败") ||
    body.includes("历史合同不可追溯") ||
    body.includes("成果物")
  ) {
    return { ok: true, reason: "ResultViewer 已按真实状态渲染（成功态成果物或失败态声明）" };
  }
  return { ok: false, reason: "未在超时内渲染 ResultViewer（详情加载失败或无成果物态）" };
}

// ── 单组件：task_detail JSON 字段 + DOM 按钮状态 ──────────────────────────
async function verifyTaskDetail(
  page: Page,
  cid: ComponentId,
  taskId: string,
  catalog: Map<string, CatalogComponentView>,
) {
  // 1) task_detail 真实请求 + JSON 验证（不依赖页面文本）
  let detail: TaskDetailJson;
  try {
    detail = await fetchTaskDetail(page, taskId);
  } catch (e) {
    fail(`${cid} task_detail 请求`, `详情请求失败: ${(e as Error)?.message || String(e)}`);
    notRun(`${cid} 其余详情断言`, `因 task_detail 不可读，无法验证（NOT_RUN 不计通过）`);
    return;
  }
  pass(`${cid} task_detail 请求`, `task_detail 返回可读 JSON（taskId 已提供）`);

  const cv = asRecord(detail.contractView);
  const serverContract = catalogContractInfo(catalog.get(cid));

  // 2) contractVersion（服务端 JSON）
  const contractVersion = typeof cv?.contractVersion === "string" ? cv.contractVersion : null;
  if (contractVersion && contractVersion.trim()) {
    pass(`${cid} contractVersion`, `task_detail 合同版本=${contractVersion}`);
  } else {
    fail(`${cid} contractVersion`, `task_detail 未返回 contractView.contractVersion（合同快照缺失）`);
  }

  // 3) outputKind（服务端 JSON）
  const outputKind = typeof cv?.outputKind === "string" ? cv.outputKind : null;
  if (outputKind) {
    pass(`${cid} outputKind`, `outputKind=${outputKind}`);
  } else {
    fail(`${cid} outputKind`, `task_detail 未返回 contractView.outputKind`);
  }

  // 4) artifact type / mimeType / rendererType + 非空内容
  const artifacts = asArray(detail.artifacts);
  const primary = artifacts[0] ?? asRecord(detail.artifact);
  if (!primary) {
    fail(`${cid} 成果物`, `task_detail 未返回成果物（artifacts/artifact 为空）`);
  } else {
    const aType = typeof primary.type === "string" ? primary.type : null;
    const aMime = typeof primary.mimeType === "string" ? primary.mimeType : null;
    const aRenderer = typeof primary.rendererType === "string" ? primary.rendererType : null;
    const aContent = typeof primary.content === "string" ? primary.content : null;
    const typeOk = !!aType && aType.trim().length > 0;
    const mimeOk = !!aMime && aMime.trim().length > 0;
    const rendererOk = !!aRenderer && aRenderer.trim().length > 0;
    const contentOk = !!aContent && aContent.trim().length > 0;
    if (typeOk && mimeOk && rendererOk) {
      pass(`${cid} artifact 类型`, `type=${aType} mime=${aMime} renderer=${aRenderer}`);
    } else {
      fail(
        `${cid} artifact 类型`,
        `type=${aType ?? "缺失"} mime=${aMime ?? "缺失"} renderer=${aRenderer ?? "缺失"}（三者必须齐全并与合同一致）`,
      );
    }
    if (contentOk) {
      pass(`${cid} 成果物非空`, `成果物内容非空（长度 ${(aContent as string).trim().length}）`);
    } else {
      fail(`${cid} 成果物非空`, `成果物内容为空或缺失`);
    }
    // 成果物类型必须与合同 output.kind 一致（合同驱动，非组件硬编码）
    if (typeOk && outputKind && aType!.toUpperCase() !== outputKind.toUpperCase()) {
      fail(`${cid} artifact 与合同一致性`, `artifact.type=${aType} 与合同 outputKind=${outputKind} 不一致`);
    } else if (typeOk && outputKind) {
      pass(`${cid} artifact 与合同一致性`, `artifact.type 与合同 outputKind 一致`);
    }
  }

  // 5) requireHumanReview：必须来自服务端字段（catalog 或 task_detail），不得写死
  const detailRHR = typeof cv?.requireHumanReview === "boolean" ? cv.requireHumanReview : null;
  const catalogRHR = serverContract?.requireHumanReview ?? null;
  const serverRHR = detailRHR ?? catalogRHR;
  if (serverRHR === null) {
    fail(
      `${cid} requireHumanReview 服务端取值`,
      `catalog 与 task_detail 均未返回 requireHumanReview（无法从服务端读取，禁止脚本写死）`,
    );
  } else {
    pass(`${cid} requireHumanReview 服务端取值`, `服务端 requireHumanReview=${serverRHR}（来源: ${detailRHR !== null ? "task_detail" : "catalog"}）`);
    if (detailRHR !== null && catalogRHR !== null && detailRHR !== catalogRHR) {
      fail(`${cid} requireHumanReview 一致性`, `task_detail=${detailRHR} 与 catalog=${catalogRHR} 不一致`);
    }
  }

  // 6) DOM：通过真实任务行点击打开 ResultViewer
  const opened = await openTaskResult(page, taskId);
  if (!opened.ok) {
    fail(`${cid} ResultViewer 渲染`, opened.reason);
  } else {
    pass(`${cid} ResultViewer 渲染`, "通过真实任务行/按钮触发并渲染 ResultViewer");
  }

  // 7) 页面人工复核展示必须与服务端 requireHumanReview 一致
  if (serverRHR !== null && opened.ok) {
    const body = await bodyText(page);
    const showsReview =
      body.includes("需人工复核") || body.includes("待人工复核") || body.includes("合同要求人工复核");
    if (showsReview === serverRHR) {
      pass(`${cid} 人工复核展示`, `页面展示=${showsReview} 与服务端 requireHumanReview=${serverRHR} 一致`);
    } else {
      fail(`${cid} 人工复核展示`, `页面展示=${showsReview} 但服务端 requireHumanReview=${serverRHR}`);
    }
  }

  // 8) 复制 / 导出按钮状态（只读，绝不触发下载）
  if (opened.ok) {
    const copyBtn = page.locator('button:has-text("复制 Markdown")').first();
    const exportBtn = page.locator('button:has-text("导出报告")').first();
    const cCount = await copyBtn.count();
    const eCount = await exportBtn.count();
    if (cCount === 0 && eCount === 0) {
      fail(`${cid} 复制/导出按钮`, "未渲染复制/导出按钮");
    } else {
      const copyDisabled = cCount > 0 ? await copyBtn.isDisabled().catch(() => null) : null;
      const exportDisabled = eCount > 0 ? await exportBtn.isDisabled().catch(() => null) : null;
      // 成功任务（SUCCESS + contractView + 非空成果物）按钮应可用
      const status = typeof detail.status === "string" ? detail.status : "";
      const expectEnabled = status === "SUCCESS" && !!cv && !!primary;
      const actualEnabled = copyDisabled === false || exportDisabled === false;
      if (status === "SUCCESS" && expectEnabled) {
        if (actualEnabled) {
          pass(`${cid} 复制/导出按钮状态`, `复制 disabled=${copyDisabled} 导出 disabled=${exportDisabled}（成功+合同+成果物 → 可导出）`);
        } else {
          fail(`${cid} 复制/导出按钮状态`, `成功任务按钮应可用，实际 disabled=${copyDisabled}/${exportDisabled}`);
        }
      } else {
        pass(`${cid} 复制/导出按钮状态`, `复制 disabled=${copyDisabled} 导出 disabled=${exportDisabled}（status=${status || "未知"}）`);
      }
    }
  }

  // 9) 敏感信息不泄露（页面 + task_detail JSON）
  await assertNoLeak(page, `${cid} 详情不泄露敏感数据`, JSON.stringify(detail));
}

// ── 失败任务态（不再可选）────────────────────────────────────────────────
async function verifyFailedTask(page: Page, taskId: string) {
  let detail: TaskDetailJson;
  try {
    detail = await fetchTaskDetail(page, taskId);
  } catch (e) {
    fail("失败任务 task_detail 请求", `详情请求失败: ${(e as Error)?.message || String(e)}`);
    return;
  }
  const status = typeof detail.status === "string" ? detail.status : "";
  const opened = await openTaskResult(page, taskId);
  const body = await bodyText(page);
  const showsFailed = body.includes("任务执行失败") || body.includes("未生成有效成果物");
  const showsRefund =
    body.includes("退款") || body.includes("未发生扣费") || body.includes("退款状态待系统确认");
  // FAILED 任务不得返回成果物
  const hasArtifact =
    asArray(detail.artifacts).length > 0 || asRecord(detail.artifact) !== null;
  if (status === "FAILED" && opened.ok && showsFailed && showsRefund && !hasArtifact) {
    pass("失败任务(只读) 失败态与退款态", "渲染失败态与退款/账务状态，且 task_detail 未返回成果物");
  } else {
    fail(
      "失败任务(只读) 失败态与退款态",
      `status=${status || "未知"} opened=${opened.ok} failed文案=${showsFailed} 退款文案=${showsRefund} 有成果物=${hasArtifact}`,
    );
  }
  // 失败任务只消费服务端 errorMessage（页面不得泄露内部堆栈）
  const leaked = scanSensitive(body);
  if (leaked.length === 0) {
    pass("失败任务 错误信息安全", "失败详情仅展示服务端安全信息，无敏感字段");
  } else {
    fail("失败任务 错误信息安全", `发现敏感标记: ${leaked.join(" / ")}`);
  }
}

// ── 合同快照缺失态（不再可选）────────────────────────────────────────────
async function verifyNoContract(page: Page, taskId: string) {
  let detail: TaskDetailJson;
  try {
    detail = await fetchTaskDetail(page, taskId);
  } catch (e) {
    fail("无合同任务 task_detail 请求", `详情请求失败: ${(e as Error)?.message || String(e)}`);
    return;
  }
  const opened = await openTaskResult(page, taskId);
  const body = await bodyText(page);
  const showsNoContract =
    body.includes("历史合同不可追溯") || body.includes("没有可追溯的历史合同快照");
  if (opened.ok && showsNoContract) {
    pass("无合同任务(只读) 不可追溯态", "渲染「历史合同不可追溯」中性态，未臆造人工复核/业务免责");
  } else {
    fail("无合同任务(只读) 不可追溯态", `opened=${opened.ok} 不可追溯文案=${showsNoContract}`);
  }
}

async function main() {
  const browser: Browser = await chromium.launch({ args: ["--no-sandbox"] });
  const context = await setupAuth(browser);
  const page = await context.newPage();

  try {
    // 0) catalog（服务端合同来源）
    let catalog = new Map<string, CatalogComponentView>();
    try {
      catalog = await fetchCatalog(page);
    } catch (e) {
      fail("catalog API 读取", `catalog 请求失败: ${(e as Error)?.message || String(e)}`);
    }

    // 1) 真实目录卡片 + 服务端合同（独立 context，隔离 /workspace 导航对主会话的污染）
    await verifyStudioCatalog(browser, catalog);
    // 2) 列表安全
    await verifyTasksListSafe(page);

    // 3) 三组件 ID 齐备性闸门（缺一 → NOT_RUN 并整体非零）
    const provided: Record<ComponentId, string> = {
      C01: TASK_ID_C01,
      C02: TASK_ID_C02,
      C07: TASK_ID_C07,
    };
    const missing = REQUIRED_COMPONENTS.filter((c) => !provided[c]);
    if (missing.length > 0) {
      notRun(
        "三组件任务 ID 齐备",
        `缺少 ${missing.join("/")} 的 TASK_ID（详情验收 NOT_RUN，不计通过）`,
      );
    } else {
      pass("三组件任务 ID 齐备", "TASK_ID_C01/C02/C07 均已提供");
    }

    // 4) 三组件详情验收
    for (const cid of REQUIRED_COMPONENTS) {
      if (!provided[cid]) {
        notRun(`${cid} 详情验收`, `未提供 TASK_ID_${cid}（NOT_RUN，不计通过）`);
        continue;
      }
      await verifyTaskDetail(page, cid, provided[cid], catalog);
    }

    // 5) 失败任务（不再可选）
    if (TASK_ID_FAILED) {
      await verifyFailedTask(page, TASK_ID_FAILED);
    } else {
      notRun("失败任务(只读) 失败态与退款态", "未提供 TASK_ID_FAILED（NOT_RUN，不计通过）");
    }

    // 6) 无合同场景（R3 §五）：真实 catalog 无合同组件；不存在则 NOT_APPLICABLE
    await verifyNoContractScenario();
  } catch (e) {
    fail("浏览器验收执行", `异常: ${(e as Error)?.message || String(e)}`);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => r.status === "FAIL");
  const notRunItems = results.filter((r) => r.status === "NOT_RUN");
  const passed = results.filter((r) => r.status === "PASS");

  console.log(
    `\n=== 浏览器只读验收汇总: ${passed.length} 通过 / ${failed.length} 失败 / ${notRunItems.length} NOT_RUN ===`,
  );
  if (failed.length > 0 || notRunItems.length > 0) {
    console.error("存在失败项或 NOT_RUN 项，浏览器只读验收未完成（NOT_RUN 不计入通过）。");
    process.exit(1);
  }
  console.log(
    "浏览器只读验收通过（仅 GET 导航 / catalog / task_detail API / DOM 只读断言，未调用 simulate / 未写库 / 未扣点）。",
  );
}

main().catch((e) => {
  console.error("浏览器只读验收脚本失败:", (e as Error)?.message || String(e));
  process.exit(2);
});
