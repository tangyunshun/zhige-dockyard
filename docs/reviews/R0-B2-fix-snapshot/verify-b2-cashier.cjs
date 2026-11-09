/**
 * R0-B2-3 收银台「组件级真实执行」验证（只读审计，不连库、不改工作区、不下载依赖）
 *
 * 与历史反例脚本 verify.cjs 完全独立，不修改它。
 * 用 TypeScript 转译 + vm 执行真实的 MockCashierInner 组件与真实展示契约模块，
 * 仅替换 hook / JSX / fetch 等 IO，验证修复后的实际渲染决策。
 *
 * 运行：node docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs
 * 注意：这是组件受控执行，不等同浏览器 DOM 验收；真实浏览器渲染仍列为未验证项。
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));

/** 转译 TS/TSX 到 CommonJS 并在隔离沙箱执行，require 走封闭白名单 */
function load(rel, stubs = {}) {
  const source = read(rel);
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  const sandbox = {
    exports,
    require: (name) => {
      if (!Object.hasOwn(stubs, name)) throw new Error("Denied require: " + name);
      return stubs[name];
    },
    console,
    fetch: stubs.__fetch,
  };
  vm.runInNewContext(js, sandbox, { filename: rel });
  return exports;
}

// 真实生产展示契约（含本批新增 resolveCashierCompletion / isConfirmedSuccessResponse）
const display = load("src/lib/payment-cashier-display.ts", {});
assert.equal(typeof display.resolveCashierCompletion, "function");
assert.equal(typeof display.isConfirmedSuccessResponse, "function");

/** 遍历 JSX 对象树 */
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

// 页面默认导出被 Suspense 包裹，需在转译产物后追加导出内部组件供直接执行
function loadWithInner(rel, stubs) {
  const source = read(rel);
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js + "\nexports.__inner = MockCashierInner;", {
    exports, console, fetch: stubs.__fetch,
    require: (name) => {
      if (!Object.hasOwn(stubs, name)) throw new Error("Denied require: " + name);
      return stubs[name];
    },
  }, { filename: rel });
  return exports;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function main() {
  console.log("=== R0-B2-3 组件级执行（真实页面组件 + 真实展示契约）===");

  const scenarios = [
    { name: "直接打开已成功席位订单", initialStatus: "SUCCESS" },
    { name: "刷新已成功席位订单（effect 再触发一次）", initialStatus: "SUCCESS", reload: true },
    { name: "PENDING 正常首次确认成功", initialStatus: "PENDING", clickPay: true },
    { name: "PENDING 重复确认成功（alreadyProcessed 中性提示）", initialStatus: "PENDING", clickPay: true,
      postResponse: { ok: true, body: { success: true, alreadyProcessed: true, seats: 2, message: "该订单此前已完成入账，未重复扣款。" } } },
    { name: "2xx 但 success:false（不得伪装成功）", initialStatus: "PENDING", clickPay: true,
      postResponse: { ok: true, body: { success: false, message: "入账未完成" } } },
    { name: "2xx 但缺完成证据（不得伪装成功）", initialStatus: "PENDING", clickPay: true,
      postResponse: { ok: true, body: { success: true, message: "ok" } } },
    { name: "非 2xx（不得伪装成功）", initialStatus: "PENDING", clickPay: true,
      postResponse: { ok: false, body: { error: "服务端错误" } } },
    { name: "EXPIRED 如实呈现", initialStatus: "EXPIRED" },
    { name: "FAILED 如实呈现", initialStatus: "FAILED" },
    { name: "REFUNDED 如实呈现", initialStatus: "REFUNDED" },
    { name: "UNKNOWN 如实呈现", initialStatus: "UNKNOWN" },
    { name: "切换订单后重新加载（上一单成功 → 新单 EXPIRED）", initialStatus: "SUCCESS", switchTo: "EXPIRED" },
  ];

  for (const s of scenarios) {
    const out = await runMockCashierWithInner(s);
    const isSuccessCase = s.initialStatus === "SUCCESS" ||
      (s.clickPay && s.postResponse === undefined) ||
      (s.clickPay && s.postResponse && s.postResponse.body && s.postResponse.body.alreadyProcessed);
    const isFailureCase = s.postResponse && (
      s.postResponse.ok === false || s.postResponse.body?.success === false ||
      (s.postResponse.body?.success === true && !("seats" in (s.postResponse.body || {}))));
    const isTerminal = ["EXPIRED", "FAILED", "REFUNDED", "UNKNOWN"].includes(s.initialStatus);

    if (s.switchTo) {
      // 切换后应显示新订单的终态，不得残留上一单的成功文案/空间入口
      const noStaleSuccess = !out.text.includes("已为空间增购") &&
        !out.links.some((l) => l.href === "/workspace-hub");
      check(`${s.name}: 新订单按自身状态呈现，上一单成功结果不残留`,
        noStaleSuccess && out.text.includes("超时"), `switchTo=${s.switchTo}`);
    } else if (isSuccessCase) {
      const hasHub = out.links.some((l) => l.href === "/workspace-hub");
      const hasPoints = out.links.some((l) => l.href === "/user/points");
      const hasCompletionText = /席位|已为空间增购|未重复扣款/.test(out.text);
      check(`${s.name}: 进入完成分支（席位文案+空间入口、无点数入口、无支付按钮）`,
        hasHub && !hasPoints && hasCompletionText && out.payButtons.length === 0,
        `links=${out.links.map((l) => l.href).join(",")} payBtn=${out.payButtons.length}`);
    } else if (isFailureCase) {
      check(`${s.name}: 本地订单不置 SUCCESS、不显示完成入口`,
        out.orderStatus !== "SUCCESS" && !out.links.some((l) => l.href === "/workspace-hub"),
        `orderStatus=${out.orderStatus}`);
    } else if (isTerminal) {
      const kw = { EXPIRED: "超时", FAILED: "失败", REFUNDED: "退款", UNKNOWN: "未知" }[s.initialStatus];
      check(`${s.name}: 终态如实呈现、不出现成功入口`,
        out.text.includes(kw) && !out.links.some((l) => l.href === "/workspace-hub"),
        `text含「${kw}」=${out.text.includes(kw)}`);
    }
  }

  // 独立断言：完成判定不依赖 tone
  const dup = display.resolveCashierCompletion("SEAT_ADDON", 2, "SUCCESS");
  check("共享判定：SUCCESS 恒为完成（与 neutral 提示无关）", dup.completed === true);
  check("共享判定：非 SUCCESS 恒为非完成",
    ["EXPIRED", "FAILED", "REFUNDED", "UNKNOWN", null].every(
      (st) => display.resolveCashierCompletion("SEAT_ADDON", 2, st).completed === false));

  // ── QR 页组件级回归：按商品类型展示与缺载体错误保持，未被本批改坏 ──
  console.log("\n=== QR 页组件级执行（真实页面组件 + 真实展示契约）===");
  const qrSeat = runQrPage({ status: "SUCCESS", type: "SEAT_ADDON", seats: 2, codeUrl: "weixin://isolated" });
  check("QR SUCCESS 席位：显示席位文案，不改回通用算力到账",
    qrSeat.includes("已为空间增购 2 个席位") && !qrSeat.includes("算力已到账"));
  const qrRecharge = runQrPage({ status: "SUCCESS", type: "TOKEN_RECHARGE", seats: 0, codeUrl: "weixin://isolated" });
  check("QR SUCCESS 充值：显示算力到账", qrRecharge.includes("算力已到账"));
  for (const [st, kw] of [["EXPIRED", "超时"], ["FAILED", "失败"], ["REFUNDED", "退款"], ["UNKNOWN", "未知"]]) {
    const t = runQrPage({ status: st, type: "SEAT_ADDON", seats: 2, codeUrl: "weixin://isolated" });
    check(`QR ${st} 终态如实呈现`, t.includes(kw));
  }
  const qrNoCarrier = runQrPage({ status: "PENDING", type: "SEAT_ADDON", seats: 2, codeUrl: null });
  check("QR PENDING 缺载体：明确报错而非无限加载", qrNoCarrier.includes("未能获取支付二维码"));

  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error("FAILED:", failed.map((f) => f.name)); process.exit(1); }
}

/** 真实执行一次 QR 页组件；仅替换 hook / JSX / qrcode 等 IO */
function runQrPage({ status, type, seats, codeUrl }) {
  const values = [
    { orderNo: "SA_fixture", title: "席位订单", type, seats, amountCents: 2600,
      points: 0, status, channel: "WECHAT_PAY", expiresAt: null, codeUrl },
    false, null, "data:image/png;fixture",
  ];
  let index = 0;
  const jsx = (t, props) => ({ type: t, props });
  const stubs = {
    react: {
      useState: () => [values[index++], () => {}],
      useCallback: (fn) => fn,
      useEffect() {},
      useRef: () => ({ current: null }),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/navigation": { useRouter: () => ({ push() {} }), useSearchParams: () => ({ get: () => "SA_fixture" }) },
    qrcode: { toDataURL: () => "data:image/png;fixture" },
    "@/utils/auth": { getAuthToken: () => "fixture" },
    "@/lib/payment-cashier-display": display,
    "lucide-react": { AlertTriangle: "Alert", CheckCircle2: "Check", CreditCard: "Card", Loader2: "Loader" },
  };
  const source = read("src/app/user/pay/qr/page.tsx");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports,
    require: (name) => {
      if (!Object.hasOwn(stubs, name)) throw new Error("Denied require: " + name);
      return stubs[name];
    },
    console,
  }, { filename: "src/app/user/pay/qr/page.tsx" });
  return textOf(exports.default());
}

// 带内部组件导出的执行器（复制 runMockCashier 逻辑，改用 loadWithInner）
async function runMockCashierWithInner(opts) {
  const { initialStatus = "PENDING", clickPay = false, reload = false } = opts;
  let getData = {
    orderNo: "SA_fixture", title: "席位订单", type: "SEAT_ADDON", seats: 2,
    amountCents: 2600, points: 0, channel: "WECHAT_PAY", status: initialStatus,
    paymentMode: "MOCK", discountPercent: 0, discountLabel: "", workspaceId: "w1",
  };
  const jsx = (type, props) => ({ type, props });
  let index = 0;
  let firstRender = true;
  const states = [];
  const effects = [];
  const react = {
    Suspense: "Suspense", useCallback: (fn) => fn,
    useEffect: (fn) => { if (firstRender) effects.push(fn); },
    useState: (initial) => {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (value) => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
    },
  };
  const postResponse = opts.postResponse || {
    ok: true, body: { success: true, alreadyProcessed: false, seats: 2, message: "模拟收款成功，已为空间增购 2 个席位（非真实扣款）" },
  };
  const stubFetch = async (_url, init) => {
    const r = init && init.method === "POST" ? postResponse : { ok: true, body: { success: true, data: getData } };
    return new Response(JSON.stringify(r.body), { status: r.ok ? 200 : 500 });
  };
  const stubs = {
    react, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/navigation": { useRouter: () => ({ back() {} }), useSearchParams: () => ({ get: () => "SA_fixture" }) },
    "next/link": { default: "Link", __esModule: true },
    "@/utils/auth": { getAuthToken: () => "fixture" },
    "@/lib/payment-cashier-display": display,
    "lucide-react": { AlertTriangle: "Alert", CheckCircle2: "Check", CreditCard: "Card", Loader2: "Loader" },
    __fetch: stubFetch,
  };
  const mod = loadWithInner("src/app/user/pay/mock/page.tsx", stubs);
  const Inner = mod.__inner;
  const render = () => { index = 0; return Inner(); };
  render();
  firstRender = false;
  for (const effect of effects) effect();
  await tick();
  if (reload) { for (const effect of effects) effect(); await tick(); }
  let tree = render();
  if (clickPay) {
    const btn = nodes(tree, (n) => n.type === "button" && textOf(n).includes("模拟支付成功"))[0];
    assert.ok(btn, "应存在支付按钮以供点击");
    await btn.props.onClick();
    await tick();
    tree = render();
  }
  // [R0-B2-3] 切换到另一订单并重新加载：验证上一单的成功 result 不残留到新订单
  if (opts.switchTo) {
    getData = { ...getData, orderNo: "SA_other", status: opts.switchTo, seats: 0 };
    for (const effect of effects) effect();
    await tick();
    tree = render();
  }
  return {
    orderStatus: states[0] && states[0].status,
    resultState: states[3],
    text: textOf(tree),
    links: nodes(tree, (n) => n.type === "Link").map((n) => ({ href: n.props.href, label: textOf(n) })),
    payButtons: nodes(tree, (n) => n.type === "button" && textOf(n).includes("模拟支付成功"))
      .map((n) => ({ disabled: n.props.disabled })),
  };
}

main().catch((e) => { console.error(e); process.exit(1); });
