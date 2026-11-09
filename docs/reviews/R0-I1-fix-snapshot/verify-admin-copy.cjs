/**
 * R0-I1 J04 管理员费率卡片受控执行（真实组件 TS 转译 + React hooks 桩，非浏览器 DOM）。
 *
 * 断言：
 *  1. 渲染输出不再包含「实时生效」「对外收费将按新费率实时重新折算」「立即对全部自带模型的估价」；
 *  2. 卡片状态显示「任务暂停 · 仅保存配置」，页脚与辅助提示含「仅保存/仍暂停」口径；
 *  3. 打开确认框：message 为「仅保存费率配置；Studio 自带模型任务调用仍暂停…」且警告不含恢复承诺；
 *  4. 保存成功提示包含「仅保存配置；Studio 自带模型任务调用仍暂停」。
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const src = fs.readFileSync(path.join(ROOT, "src/app/admin/models/byok-service-rate.tsx"), "utf8");

const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText;

// ---- 沙箱依赖 ----
const fetches = [];
const toasts = [];
let fetchBehavior = { ok: true, data: { byokServiceRateBps: 1500, percent: 15 } };

globalThis.fetch = async (url, opts) => {
  fetches.push({ url: String(url), method: (opts && opts.method) || "GET", body: opts && opts.body });
  if (String(url).includes("byok-service-rate")) {
    return { ok: fetchBehavior.ok, status: 200, json: async () => ({ success: fetchBehavior.ok, data: fetchBehavior.data }) };
  }
  return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
};
globalThis.localStorage = { getItem: () => "fixture-token", setItem: () => {}, removeItem: () => {} };

let slots, cursor, dirty, effects;
const react = {
  useState(init) {
    if (!slots) slots = [];
    const i = cursor++;
    if (slots[i] === undefined) slots[i] = typeof init === "function" ? init() : init;
    return [slots[i], (v) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; dirty = true; }];
  },
  useEffect(fn) { effects.push(fn); },
  useCallback(fn) { return fn; },
  useRef(init) { return { current: init }; },
};
const jsx = (t, p, ...kids) => {
  const props = { ...(p || {}) };
  if (kids && kids.length === 1) props.children = kids[0];
  else if (kids && kids.length > 1) props.children = kids;
  // 函数组件在同一次渲染内递归执行（与 React 挂载顺序一致）
  if (typeof t === "function") return t(props);
  return { type: t, props };
};
const requireStub = (name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
  if (name === "next/dist/api/…") return {};
  if (name.includes("lucide-react")) return new Proxy({}, { get: () => (p) => ({ type: "icon", props: p }) });
  if (name.includes("utils/auth")) return { getAuthToken: () => "fixture-token" };
  if (name.includes("ConfirmDialog")) {
    return {
      ConfirmDialog: (p) => { globalThis.__confirmProps = p; globalThis.__dialogCalls = (globalThis.__dialogCalls || 0) + 1; return { type: "ConfirmDialog", props: p }; },
    };
  }
  if (name.includes("components/Toast")) {
    return { useToast: () => ({ success: (m) => toasts.push(["success", m]), error: (m) => toasts.push(["error", m]), info: (m) => toasts.push(["info", m]) }) };
  }
  return {};
};
const sandbox = {
  console, require: requireStub, exports: {}, module: { exports: {} }, globalThis: {},
  React: { createElement: (t, p, ...kids) => jsx(t, p, ...kids), Fragment: "Fragment" },
  useState: react.useState, useEffect: react.useEffect, useCallback: react.useCallback, useRef: react.useRef,
  // vm 上下文无 Node/浏览器内置：注入回调所需全局（fetch 为上方带记录的桩）
  fetch: globalThis.fetch, URLSearchParams, URL, File: class File {}, FormData: class FormData {},
  crypto, TextEncoder, setTimeout, clearTimeout, alert: () => {},
  localStorage: globalThis.localStorage,
};
vm.runInContext(js, vm.createContext(sandbox));
const Component = sandbox.module.exports.ByokServiceRateSync || sandbox.exports.ByokServiceRateSync;
assert.ok(typeof Component === "function", "未找到组件导出");

function render() {
  slots = null; cursor = 0; dirty = false; effects = [];
  return Component({ onApplied: undefined });
}
function rerender() {
  // 保留状态（slots）仅重渲染——确认框打开后内容可见
  cursor = 0; dirty = false;
  return Component({ onApplied: undefined });
}
function str(node, acc) {
  if (node === null || node === undefined || node === false || node === true) return acc;
  if (typeof node === "string" || typeof node === "number") { acc.push(String(node)); return acc; }
  if (Array.isArray(node)) { node.forEach((c) => str(c, acc)); return acc; }
  if (node.props) {
    if (node.props.title) acc.push(String(node.props.title));
    if (node.props.message) acc.push(String(node.props.message));
    if (Array.isArray(node.props.warnings)) acc.push(...node.props.warnings.map(String));
    str(node.props.children, acc);
  }
  return acc;
}
function allText(tree) { return str(tree, []).join("\n"); }
async function drain() {
  for (let i = 0; i < 10 && (effects.length || i < 2); i++) {
    const fns = effects.splice(0);
    for (const fn of fns) await fn();
    // 等待异步 load 的微任务/定时器链完成（setInput 等发生在 await 之后）
    await new Promise((r) => setTimeout(r, 2));
  }
  // setState 触发的重渲染
  if (dirty) { slots && (dirty = false); }
}

(async () => {
  // 1. 首次渲染（load 完成后），后续保留状态重渲染
  let tree = render();
  await drain();
  tree = rerender();
  const text1 = allText(tree);
  assert.ok(!text1.includes("实时生效"), "卡片/提示不再包含「实时生效」");
  assert.ok(text1.includes("任务暂停 · 仅保存配置"), "卡片状态显示任务暂停 · 仅保存配置");
  assert.ok(text1.includes("仅存配置") || text1.includes("仅作为已存配置展示"), "辅助提示/页脚为仅存配置口径");
  assert.ok(!text1.includes("立即应用于计费结算"), "页脚不再承诺立即应用");

  // 2. 打开确认框
  globalThis.__confirmProps = null;
  tree = rerender();
  // 找到保存按钮（onClick: () => setConfirmOpen(true)）并触发
  const findAndClick = (node) => {
    if (!node || !node.props) return false;
    let found = false;
    if (node.props.onClick && String(node.props.onClick).includes("setConfirmOpen")) {
      node.props.onClick();
      return true;
    }
    const kids = node.props.children;
    if (Array.isArray(kids)) found = kids.some(findAndClick) || found;
    else if (kids) found = findAndClick(kids) || found;
    return found;
  };
  const clicked = findAndClick(tree);
  assert.ok(clicked, "保存按钮已点击");
  tree = rerender();
  assert.ok(globalThis.__confirmProps, "确认框已打开");
  const cm = globalThis.__confirmProps;
  assert.ok(cm.message.includes("仅保存费率配置；Studio 自带模型任务调用仍暂停"), "确认弹窗 message 统一口径");
  assert.ok(cm.message.includes("恢复需单独授权"), "确认弹窗说明恢复需授权");
  assert.ok(!cm.message.includes("实时重新折算"), "确认弹窗不再宣称实时折算");
  assert.ok(cm.warnings.every((w) => !w.includes("立即对全部自带模型")), "警告不再宣称立即全量生效");
  assert.ok(cm.warnings.some((w) => w.includes("不会恢复自带模型任务调用")), "警告包含不会恢复调用");

  // 3. 保存成功提示
  await cm.onConfirm();
  const okToast = toasts.find(([k, m]) => k === "success" && m.includes("仅保存配置；Studio 自带模型任务调用仍暂停"));
  assert.ok(okToast, "保存成功提示含「仅保存配置；Studio 自带模型任务调用仍暂停」");

  // 4. 保存失败提示（不承诺生效）：保留状态，仅改 fetch 行为
  toasts.length = 0;
  fetchBehavior = { ok: false, data: {} };
  globalThis.__confirmProps = null;
  tree = rerender();
  findAndClick(tree);
  tree = rerender();
  await globalThis.__confirmProps.onConfirm();
  assert.ok(toasts.some(([k, m]) => k === "error" && m.includes("保存 BYO 服务费率失败")), "保存失败如实提示");
  assert.ok(!toasts.some(([, m]) => m.includes("生效")), "失败路径不出现任何「生效」承诺");
  console.log("RESULT: 4/4 admin-copy checks passed");
})().catch((e) => {
  console.error("FAILED:", e && e.message);
  console.error(e && e.stack);
  process.exit(1);
});
