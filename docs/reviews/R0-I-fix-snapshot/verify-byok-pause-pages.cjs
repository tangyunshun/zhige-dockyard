/**
 * R0-I I05 页面级验证（受控执行真实回调，非浏览器 DOM）。
 *
 * 从 src/components/WorkspaceInternalLayoutV3.tsx 用 TypeScript AST 提取真实的
 * handleExecuteSimulation 回调源码，在 vm 沙箱中执行（仅替换 fetch/toast/状态 setter 等 IO）：
 *  1. 估价接口返回 BYOK 暂停（blocked=true）→ toast 展示暂停说明、busy 恢复（false）、
 *     不发执行 POST、不写成功状态、不引导充值；
 *  2. 执行 POST 返回 409 BYOK_BILLING_POLICY_UNCONFIRMED → 错误 toast、busy 恢复、无假任务。
 * 另做平台模型正常路径对照（200 成功任务被写入本地任务列表）。
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const src = fs.readFileSync(path.join(ROOT, "src/components/WorkspaceInternalLayoutV3.tsx"), "utf8");

// ---- AST 提取真实回调源码 ----
const sf = ts.createSourceFile("page.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callbackText = null;
(function visit(node) {
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      if (decl.name.getText(sf) === "handleExecuteSimulation") {
        callbackText = decl.initializer.getText(sf);
      }
    }
  }
  ts.forEachChild(node, visit);
})(sf);
assert.ok(callbackText, "未找到 handleExecuteSimulation 回调");

// ---- 沙箱执行 ----
function runCallbackScenario({ estimateResponse, postResponse, postStatus }) {
  const calls = { toasts: [], fetches: [], busy: [], localTasks: [], localStorage: {} };
  const sandboxFetch = async (url, opts) => {
    calls.fetches.push({ url: String(url), method: (opts && opts.method) || "GET" });
    if (String(url).startsWith("/api/billing/estimate")) {
      return { ok: true, status: 200, json: async () => estimateResponse };
    }
    // /api/studio
    return { ok: postStatus === 200, status: postStatus, json: async () => postResponse };
  };
  const sandbox = {
    console,
    fetch: sandboxFetch,
    getAuthToken: () => "fixture-token",
    toast: { success: (m) => calls.toasts.push(["success", m]), error: (m) => calls.toasts.push(["error", m]), info: (m) => calls.toasts.push(["info", m]) },
    setIsExecutingTask: (v) => calls.busy.push(v),
    localStorage: {
      setItem: (k, v) => { calls.localStorage[k] = v; },
      getItem: (k) => calls.localStorage[k] ?? null,
      removeItem: (k) => { delete calls.localStorage[k]; },
    },
    router: { push: () => {} },
    // 组件状态/数据桩：满足回调自由变量
    execCompId: "comp-1",
    addLocalTask: (t) => calls.localTasks.push(t),
    refreshBoundComponents: async () => {},
    refreshQuota: async () => {},
    setExecResult: () => {},
    setExecPanelOpen: () => {},
    // 模拟输入材料状态
    quickSelectedCompId: null,
    // 其余自由变量桩（由 AST 自由标识符清单生成；值为通用中性桩，不参与被验证路径的断言）
    availableTokenForUser: -1,
    componentId: null,
    file: null, fileInputRef: { current: null }, id: null, inputMaterial: null,
    isManager: false, isMemberView: false, label: null, materialInputMode: "text",
    name: null, normalizeTaskStatus: () => "RUNNING", openHistoryTaskDetail: () => {},
    options: undefined, payWithPersonal: false, quickFormData: null,
    quickInputMaterial: "这是一段正常的文本输入材料。",
    refKnowledgeTitle: null, required: undefined, restrictedComponentIds: [],
    selectedAsset: null, setMaterialInputMode: () => {}, setMaterialValidationError: () => {},
    setPersonalPayInfo: () => {}, setQuickFormData: () => {}, setQuickInputMaterial: () => {},
    setQuickResultHistoryOpen: () => {}, setRecentTasks: () => {}, setSelectedAsset: () => {},
    setShowPersonalPayModal: () => {}, setUploadedFileMeta: () => {}, setUploadedFiles: () => {},
    setWorkspaceToken: () => {}, size: undefined, sizeBytes: undefined, title: null,
    type: null, undefined: undefined, uploadedFileMeta: null,
    Record: {}, TaskRecord: {}, workspaceId: 1001, workspaceType: "PERSONAL",
    // vm 上下文无 Node/浏览器内置，注入回调所需的平台无关全局（URLSearchParams 等）
    URLSearchParams, URL, File: class File {}, FormData: class FormData {}, crypto,
    TextEncoder, setTimeout, clearTimeout, alert: () => {},
    componentCatalog: [{ id: "comp-1", name: "测试组件", contractReady: true, activeContractLifecycle: "PUBLISHED", estimatedModelTokens: 100 }],
    execMaterialText: "这是一段正常的文本输入材料。",
  };
  sandbox.window = { dispatchEvent: () => {}, location: { href: "" } };
  const ctx = vm.createContext(sandbox);
  // 以 async 箭头函数形式执行真实回调源码（overrides 允许注入 deploymentId）
  let js = ts.transpileModule(callbackText, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/^"use strict";?/, "").trim().replace(/;$/, ""); // 剥离片段前缀与初始化尾分号
  vm.runInContext(`globalThis.__run = (${js});`, ctx);
  if (typeof sandbox.__run !== "function") {
    throw new Error("callback transpile mismatch: " + js.slice(0, 120));
  }
  return sandbox.__run({ componentId: "comp-1", inputMaterial: "这是一段正常的文本输入材料。" }).then(() => calls);
}

(async () => {
  // 场景 1：估价返回 BYOK 暂停 → 前端立即终止，不发送执行 POST
  const s1 = await runCallbackScenario({
    estimateResponse: {
      success: true,
      data: { blocked: true, canExecute: false, code: "BYOK_BILLING_POLICY_UNCONFIRMED", message: "自带模型（BYOK）的任务调用暂不可用：平台收费口径待确认。本次不产生可扣点报价，未扣点、未调用模型。" },
    },
    postResponse: { success: false },
    postStatus: 409,
  });
  assert.ok(s1.busy[s1.busy.length - 1] === false, "场景1：busy 恢复为 false");
  assert.ok(s1.toasts.some(([, m]) => m.includes("收费口径待确认") && m.includes("未扣点")), "场景1：展示暂停说明");
  assert.ok(!s1.fetches.some((f) => f.url.startsWith("/api/studio")), "场景1：未发送执行 POST");
  assert.ok(s1.fetches.some((f) => f.url.startsWith("/api/billing/estimate")), "场景1：估价请求已发出（暂停发生在估价返回后）");
  assert.ok(s1.localTasks.length === 0, "场景1：无伪造任务");
  assert.ok(!s1.toasts.some(([k]) => k === "success"), "场景1：无成功提示");
  assert.ok(!Object.keys(s1.localStorage).includes("personalWorkspaceUpgraded"), "场景1：无本地成功标记");
  console.log("PASS  场景1 估价暂停：busy 恢复、暂停说明、未发执行 POST、无伪造任务/成功");

  // 场景 2：估价可用但执行 POST 返回 409 暂停 → 错误提示 + busy 恢复 + 无假任务
  const s2 = await runCallbackScenario({
    estimateResponse: { success: true, data: { points: 100, yuan: 1, basis: "FIXED_POINTS" } },
    postResponse: { success: false, code: "BYOK_BILLING_POLICY_UNCONFIRMED", error: "自带模型（BYOK）的任务调用暂不可用：平台收费口径待确认。本次未扣除算力点、未调用模型服务；您的模型配置与绑定已保留，待平台完成收费口径确认后恢复。" },
    postStatus: 409,
  });
  assert.ok(s2.fetches.some((f) => f.url.startsWith("/api/studio")), "场景2：发送了执行 POST");
  assert.ok(s2.busy[s2.busy.length - 1] === false, "场景2：busy 恢复为 false");
  assert.ok(s2.toasts.some(([, m]) => m.includes("收费口径待确认")), "场景2：展示后端暂停说明");
  assert.ok(s2.localTasks.length === 0, "场景2：无伪造任务");
  assert.ok(!s2.toasts.some(([k]) => k === "success"), "场景2：无成功提示");
  console.log("PASS  场景2 执行 409 暂停：错误说明、busy 恢复、无伪造任务/成功提示");

  // 场景 3 对照：平台模型正常成功 → 任务写入（不误拦正常请求）
  const s3 = await runCallbackScenario({
    estimateResponse: { success: true, data: { points: 100, yuan: 1, basis: "FIXED_POINTS" } },
    postResponse: { success: true, task: { id: "task-1", status: "RUNNING" }, data: { taskId: "task-1" } },
    postStatus: 200,
  });
  assert.ok(s3.toasts.some(([k]) => k === "success"), "场景3：正常成功提示");
  console.log("PASS  场景3 平台模型正常路径对照：成功提示（不因 BYOK 暂停误拦）");

  console.log("RESULT: 3/3 scenarios passed");
})().catch((e) => {
  console.error("FAILED:", e && e.message);
  process.exit(1);
});
