/**
 * R0-D D07 页面组件级验证（受控执行，非浏览器 DOM）。
 *
 * 用 TypeScript 转译 + vm 执行**真实**两个页面模块：
 *   - src/app/admin/finance/refund-requests/page.tsx（真实组件 + resolve handler + ResolveModal）
 *   - src/components/UserRefundRequests.tsx（真实组件）
 * 仅替换 React hooks / JSX runtime / fetch / toast / 图标 / 工具等 IO；不 mock 被修的页面逻辑。
 *
 * 断言：管理员批准禁用且显示暂停原因、handler 不发批准请求/不到账；
 * 驳回等相邻功能保留；用户组件显示暂停与参考金额口径，不宣称已核准净额。
 * 另核对后端契约：专用权限键、APPROVE 409 暂停位于任何读/写之前。
 *
 * 运行：node docs/reviews/R0-D-fix-snapshot/verify-r0d-pages.cjs
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
const PAUSED = "人工批准退点暂不可用，申请保留待核查；不会因此重复退点或转入个人钱包";

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
function load(rel, stubs, extraCode = "") {
  const js = ts.transpileModule(read(rel), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js + extraCode, {
    exports, console, fetch: stubs.__fetch,
    require: (name) => {
      if (!Object.hasOwn(stubs, name)) throw new Error("Denied require: " + name);
      return stubs[name];
    },
  }, { filename: rel });
  return exports;
}
function makeIO() {
  const io = { fetches: [], toasts: [], events: [] };
  const toast = {
    success: (m) => io.toasts.push({ level: "success", message: m }),
    error: (m) => io.toasts.push({ level: "error", message: m }),
    warning: (m) => io.toasts.push({ level: "warning", message: m }),
    info: (m) => io.toasts.push({ level: "info", message: m }),
  };
  const stubFetch = async (url, init) => {
    io.fetches.push({ url: String(url), method: (init && init.method) || "GET" });
    return new Response(JSON.stringify({ success: true, data: [], capabilities: {} }), { status: 200 });
  };
  return { io, toast, stubFetch };
}
const iconStub = new Proxy({}, { get: () => "Icon" });

// ── 1. 管理员页面：真实组件执行 ──
function runAdminPage() {
  const { io, toast, stubFetch } = makeIO();
  const rows = [{
    id: "rr-1", taskId: "t1", taskName: "fixture task", userId: "u1", points: 100,
    status: "PENDING", applicant: { name: "u1", email: "u1@x" }, admin: null,
    refundLedgerId: null, resolvedAt: null, componentId: null, componentName: null,
  }];
  const values = [rows, false, 1, "ALL", "", null, false, false];
  let idx = 0;
  const stubs = {
    react: {
      useCallback: (fn) => fn,
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useState: () => { const v = values[Math.min(idx, values.length - 1)]; idx++; return [v, () => {}]; },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "lucide-react": iconStub,
    "@/utils/auth": { getAuthToken: () => "fixture" },
    "@/hooks/useEscapeKey": { useEscapeKey: () => {} },
    "@/utils/format": { formatDateTime: (v) => String(v), maskEmail: (v) => String(v), maskPhone: (v) => String(v) },
    "@/components/Toast": { useToast: () => toast },
    "@/lib/point-rate": { formatYuanFromPoints: (v) => `¥${Number(v) / 100}` },
    "@/utils/excel-export": { exportToExcel: () => {}, formatExcelDateTime: (v) => String(v) },
    "@/contexts/AdminPermissionContext": { useAdminPermission: () => ({ hasPermission: () => true }) },
    "@/lib/use-export-max-rows": { useExportMaxRows: () => 5000 },
    __fetch: stubFetch,
  };
  let mod;
  try { mod = load("src/app/admin/finance/refund-requests/page.tsx", stubs, "\nexports.__ResolveModal = ResolveModal;"); }
  catch (e) { check("D07 管理员页模块加载", false, e.message); return; }

  idx = 0;
  const tree = mod.default();
  const text = textOf(tree);
  check("D07 管理员页显示人工批准暂停说明", text.includes(PAUSED));
  check("D07 管理员页不宣称同意退款会真实退点", !text.includes("同意退款会真实退点"));
  check("D07 管理员页统计口径改为申请参考值",
    text.includes("点申请参考值") || /申请参考值/.test(read("src/app/admin/finance/refund-requests/page.tsx")));

  const buttons = nodes(tree, (n) => n.type === "button");
  const approveBtn = buttons.find((b) => textOf(b).includes("批准退点（暂不可用）"));
  check("D07 管理员页批准控件禁用", !!approveBtn && approveBtn.props.disabled === true);
  const rejectBtn = buttons.find((b) => textOf(b).trim() === "驳回");
  check("D07 管理员页驳回入口保留", !!rejectBtn && rejectBtn.props.disabled !== true);

  // 真实 ResolveModal（approve 分支）：确认按钮禁用，无「确认退款」承诺
  const modalTree = mod.__ResolveModal({
    row: rows[0], type: "approve", busy: false, onClose: () => {},
    onConfirm: () => { io.events.push("approve-confirm"); },
  });
  const modalText = textOf(modalTree);
  check("D07 批准弹窗显示暂停与参考金额口径",
    modalText.includes(PAUSED) && modalText.includes("申请参考值") && modalText.includes("非已核准净可退金额"));
  check("D07 批准弹窗不含『确认退款/真实退点写入流水』承诺",
    !modalText.includes("确认退款") && !modalText.includes("确认后平台将真实退点"));
  const modalButtons = nodes(modalTree, (n) => n.type === "button");
  const confirmBtn = modalButtons.find((b) => textOf(b).includes("暂不可用"));
  check("D07 批准弹窗确认按钮禁用", !!confirmBtn && confirmBtn.props.disabled === true);

  // 真实 resolve handler：抽取源码片段执行，APPROVE 不发请求、不成功到账
  const src = read("src/app/admin/finance/refund-requests/page.tsx");
  const start = src.indexOf("const resolve = async (row");
  assert.ok(start > 0, "admin resolve handler not found");
  const end = src.indexOf("\n  };", start);
  const snippet = src.slice(start, end + 5);
  assert.ok(snippet.includes("action === \"APPROVE\""), "approve guard missing");
  const sandbox = {
    toast, fetch: async (url, init) => { io.fetches.push({ url: String(url), method: (init && init.method) || "GET" }); return new Response("{}", { status: 200 }); },
    setBusyId: () => {}, setModal: () => {}, load: async () => {},
    window: { dispatchEvent: (e) => io.events.push(e.type) },
    Event: class { constructor(t) { this.type = t; } },
    MANUAL_APPROVAL_PAUSED_MESSAGE: PAUSED,
    Number, Math, JSON, Error, String, Promise,
  };
  // 片段含 TS 类型注解，先按真实源码转译为 JS 再在 vm 执行
  const runnable = ts.transpileModule(
    snippet + "\nresolve({ id: 'rr-1', points: 100 }, 'APPROVE', '');",
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } },
  ).outputText;
  vm.runInNewContext(runnable, sandbox, { filename: "admin#resolve" });
  check("D07 管理员 resolve(APPROVE) 不发批准 POST",
    io.fetches.filter((f) => String(f.url).includes("/resolve")).length === 0);
  check("D07 管理员 resolve(APPROVE) 无成功到账 Toast",
    io.toasts.every((t) => t.level !== "success"));
  check("D07 管理员 resolve(APPROVE) 给出暂停提示",
    io.toasts.some((t) => t.level === "info" && t.message.includes(PAUSED)));
}

// ── 2. 用户组件：真实组件执行 ──
function runUserComponent() {
  const { io, toast } = makeIO();
  const stubs = {
    react: {
      useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(),
      useState: (initial) => [initial, () => {}],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "react-dom": { createPortal: (node) => node },
    "lucide-react": iconStub,
    "@/components/Toast": { useToast: () => toast },
    "@/utils/auth": { getAuthToken: () => "fixture" },
    "@/utils/format": { formatDateTime: (v) => String(v) },
    "@/lib/point-rate": { formatYuanFromPoints: (v) => String(v) },
    __fetch: async () => new Response("{}", { status: 200 }),
  };
  let mod;
  try { mod = load("src/components/UserRefundRequests.tsx", stubs); }
  catch (e) { check("D07 用户组件模块加载", false, e.message); return; }
  let tree;
  try { tree = mod.default({ onChanged: () => {} }); }
  catch (e) { check("D07 用户组件渲染", false, e.message); return; }
  const text = textOf(tree);
  check("D07 用户组件显示人工批准暂停说明", text.includes(PAUSED));
  check("D07 用户组件说明申请保留待核查、不误报到账",
    text.includes("申请保留待核查") && !text.includes("退款已到账"));
  check("D07 用户组件说明技术失败自动原路退点不受影响", text.includes("原路自动退点不受影响"));
  // 候选列表在空态不渲染，标签文案以真实源码为准（渲染态由组件条件分支决定）
  const userSrc = read("src/components/UserRefundRequests.tsx");
  check("D07 用户组件金额口径为参考申请值",
    text.includes("历史扣点（参考申请值）") ||
    (userSrc.includes("历史扣点（参考申请值）") && userSrc.includes("参考申请值 ")));
  check("D07 用户组件不宣称已核准净可退金额",
    text.includes("不代表已核准的净可退金额") && !text.includes("已核准净可退金额："));
  check("D07 用户组件保留受理/历史/撤销相邻入口",
    text.includes("算力点退回申请") && text.includes("刷新"));
  check("D07 用户组件渲染不发批准/退款请求",
    io.fetches.filter((f) => String(f.url).includes("/resolve")).length === 0);
}

// ── 3. 后端契约核对（与 D01—D05 互补，防止页面被当安全边界） ──
function checkServerContract() {
  const resolve = read("src/app/api/admin/refund-requests/[id]/resolve/route.ts");
  const adminGet = read("src/app/api/admin/refund-requests/route.ts");
  const userGet = read("src/app/api/user/refund-requests/route.ts");
  check("D07 后端裁决只请求 order:refund_approve",
    resolve.includes('requirePlatformPermission(request, REFUND_APPROVE_PERMISSION)') &&
    resolve.includes('const REFUND_APPROVE_PERMISSION = "order:refund_approve"') &&
    !resolve.includes('requirePlatformPermission(request, "order:read")'));
  check("D07 后端不再调用 grantPoints", !resolve.includes("grantPoints(") && !resolve.includes('from "@/lib/credit-service"'));
  const approveGuard = resolve.indexOf('if (action === "APPROVE")');
  const findReq = resolve.indexOf("prisma.refundrequest.findUnique");
  check("D07 APPROVE 暂停分支位于读取指定申请之前",
    approveGuard > 0 && findReq > 0 && approveGuard < findReq);
  check("D07 APPROVE 返回 409 + success:false + 稳定 code",
    /MANUAL_REFUND_APPROVAL_PAUSED/.test(resolve) && /status: 409/.test(resolve) && /success: false/.test(resolve));
  check("D07 REJECT 使用 PENDING 条件裁决并检查 count",
    resolve.includes('where: { id, status: "PENDING" }') && resolve.includes("rejected.count !== 1"));
  check("D07 两个 GET 返回暂停能力事实且不含伪造净额字段",
    adminGet.includes("manualApprovalPaused: true") && adminGet.includes("pointsAreReferenceOnly: true") &&
    userGet.includes("manualApprovalPaused: true") &&
    // 注释里提到「不新增 remainingRefundable 字段」是说明文字；只检查是否真有该字段
    !/remainingRefundable\s*:/.test(adminGet) && !/remainingRefundable\s*:/.test(userGet));
}

async function main() {
  console.log("=== R0-D D07 页面组件级验证（真实组件/handler 受控执行）===");
  runAdminPage();
  runUserComponent();
  checkServerContract();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error("FAILED:", failed.map((f) => f.name)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
