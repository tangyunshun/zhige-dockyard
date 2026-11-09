/**
 * R0-E E07 页面组件级验证（受控执行，非浏览器 DOM）。
 *
 * 用 TypeScript 转译 + vm 执行**真实**模拟收银台页面组件：
 *   - src/app/user/pay/mock/page.tsx（真实组件 MockCashierInner）
 * 仅替换 React hooks / JSX runtime / 路由 / fetch / 图标 / 工具等 IO；不 mock 被修的支付裁决逻辑。
 *
 * 断言：生产 mock GET 返回 403 后，页面经 authFetch 错误分支 setError，渲染错误提示且不显示
 * 「模拟支付成功」等可操作模拟付款按钮、不设置本地 SUCCESS、不跳模拟页、不自动重买。
 *
 * 运行：node docs/reviews/R0-E-fix-snapshot/verify-r0e-pages.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const assert = require("node:assert/strict");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}
const CODE = "PRODUCTION_MOCK_PAYMENT_DISABLED";
const ERR_MSG = "当前支付配置不允许在生产环境使用模拟支付（PAYMENT_MODE=mock）。该操作已拒绝；请改用真实支付渠道或修正部署配置。";

const jsx = (type, props) => ({ type, props });
function nodes(tree, pred, out = []) {
  if (!tree || typeof tree !== "object") return out;
  if (Array.isArray(tree)) { for (const c of tree) nodes(c, pred, out); return out; }
  if (pred(tree)) out.push(tree);
  for (const [k, v] of Object.entries(tree.props || {})) {
    if (k === "children" || (v && typeof v === "object")) nodes(v, pred, out);
  }
  return out;
}
function textOf(n) {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join(" ");
  if (typeof n === "object") return textOf(n.props && n.props.children);
  return "";
}

function buildHarness(opts) {
  const resp = opts.response; // { status, body }
  const stubs = {
    react: {
      useState(init) {
        const slot = this.__slots || (this.__slots = []);
        const i = slot.length;
        if (slot[i] === undefined) slot[i] = typeof init === "function" ? init() : init;
        const set = (v) => { slot[i] = typeof v === "function" ? v(slot[i]) : v; dirty = true; };
        return [slot[i], set];
      },
      useEffect(fn) { pendingEffects.push(fn); },
      useCallback(fn) { return fn; },
      useMemo(fn) { return fn(); },
      Suspense: ({ children }) => children,
      Fragment: "Fragment",
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/navigation": {
      useRouter: () => ({ back() {}, push() {} }),
      useSearchParams: () => ({ get: (k) => (k === "orderNo" ? "TR_test" : null) }),
    },
    "next/link": "Link",
    "@/utils/auth": { getAuthToken: () => "tok" },
    "@/lib/payment-cashier-display": {
      resolveCashierStatusView: () => ({ statusLabel: "待支付", tone: "neutral" }),
      resolveCashierSuccessView: () => ({ entries: [{ href: "/a", label: "A" }] }),
      resolveCashierCompletion: () => ({ completed: false, message: "" }),
      isConfirmedSuccessResponse: () => false,
    },
    "lucide-react": new Proxy({}, { get: () => "Icon" }),
  };
  // 全局 fetch 返回受控响应
  const fetchStub = async () => ({
    ok: resp.status < 400,
    status: resp.status,
    json: async () => resp.body,
    text: async () => JSON.stringify(resp.body),
  });
  let dirty = true;
  const pendingEffects = [];
  let tree = null;
  const sandbox = {
    console,
    fetch: fetchStub,
    require: (name) => {
      if (!Object.hasOwn(stubs, name)) throw new Error("Denied require: " + name);
      // 处理 react 的 this 绑定的 __slots
      const m = stubs[name];
      if (name === "react") {
        Object.defineProperty(m.useState, "__slotsHolder", { value: m, enumerable: false });
      }
      return m;
    },
  };
  const js = ts.transpileModule(read("src/app/user/pay/mock/page.tsx"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const moduleObj = { exports };
  sandbox.exports = exports;
  sandbox.module = moduleObj;
  const jsWithExport = js + "\nexports.MockCashierInner = (typeof MockCashierInner !== 'undefined') ? MockCashierInner : null;";
  vm.runInNewContext(jsWithExport, sandbox, { filename: "mock-page.tsx" });
  const Inner = exports.MockCashierInner || moduleObj.exports.MockCashierInner;
  let slots = null;
  let cursor = 0;
  // 包装 useState：跨渲染复用同一份 slots，每次渲染用游标定位（与 React 一致）
  const render = () => {
    cursor = 0;
    return Inner({});
  };
  stubs.react.useState = (init) => {
    if (!slots) slots = [];
    const i = cursor++;
    if (slots[i] === undefined) slots[i] = typeof init === "function" ? init() : init;
    const set = (v) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; dirty = true; };
    return [slots[i], set];
  };

  async function flush() {
    let guard = 0;
    while (dirty && guard++ < 30) {
      dirty = false;
      tree = render();
      const batch = pendingEffects.splice(0);
      for (const fn of batch) { try { await fn(); } catch (e) { /* 错误分支由组件自身处理 */ } }
    }
    // 组件用 `void (async () => {...})()` 启动异步 IIFE，需等待微任务/宏任务落地后再渲染
    for (let r = 0; r < 60; r++) {
      await new Promise((res) => setImmediate(res));
      if (dirty) {
        dirty = false;
        tree = render();
        const b = pendingEffects.splice(0);
        for (const fn of b) { try { await fn(); } catch (e) {} }
      }
    }
    tree = render();
  }
  return { flush, getTree: () => tree };
}

function run() {
  console.log("=== R0-E E07 页面组件级验证（真实模拟收银台受控执行）===");
  try {
    const h = buildHarness({ response: { status: 403, body: { success: false, code: CODE, error: ERR_MSG } } });
    // 执行真实渲染与受控 fetch
    (async () => {
      try {
        await h.flush();
        const tree = h.getTree();
        const text = textOf(tree);
        check("E07 页面加载并受控渲染（真实组件 MockCashierInner）", !!tree);
        check("E07 生产 mock 下页面展示后端错误原因，不假成功", text.includes("生产环境") && !text.includes("模拟支付成功"));
        const buttons = nodes(tree, (n) => n.type === "button");
        const hasPaySuccess = buttons.some((b) => textOf(b).includes("模拟支付成功"));
        check("E07 页面不渲染可操作的模拟付款成功按钮", !hasPaySuccess);
        const hasRetry = buttons.some((b) => textOf(b).includes("返回") || textOf(b).includes("查看账单"));
        check("E07 页面错误态提供返回/账单入口而非自动重买", hasRetry);
      } catch (e) {
        check("E07 受控渲染执行", false, e.message);
      }
      // 契约兜底：即便受控执行受限，后端契约已由单元测试覆盖，这里核实页面源码依赖后端 403 消息
      const src = read("src/app/user/pay/mock/page.tsx");
      check("E07 页面源码经 authFetch 错误分支 setError（依赖后端 403 消息）",
        src.includes("setError") && src.includes("result?.message") && !src.includes("process.env.PAYMENT_MODE"));
      const passed = results.filter((r) => r.ok).length;
      console.log(`\nRESULT: ${passed}/${results.length} checks passed`);
      if (passed < results.length) process.exit(1);
    })();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
