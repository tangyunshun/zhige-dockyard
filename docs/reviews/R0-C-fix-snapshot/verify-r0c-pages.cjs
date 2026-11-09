/**
 * R0-C C06 页面组件级验证（受控执行，非浏览器 DOM）。
 *
 * 用 TypeScript 转译 + vm 执行**真实**三个页面模块：
 *   - EnterprisePoolManager.tsx（真实组件函数）
 *   - RechargeModal.tsx（真实组件函数，recycle 页签）
 *   - WorkspaceInternalLayoutV3.tsx 的 handleExecuteRecycle（真实源码提取执行）
 * 仅替换 React hooks / JSX runtime / fetch / toast / 图标等 IO；不 mock 被修的页面逻辑。
 *
 * 断言：显示暂停文案；无成功 Toast；回收控件不发起 /api/.../recycle 请求；
 * 防御 handler 被直接调用也只提示暂停；相邻余额读取与阈值功能仍存在。
 *
 * 运行：node docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs
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

const PAUSED = "企业额度转入个人钱包暂不可用，原余额保留在企业空间";

/** 通用 JSX 与文本遍历 */
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

/** 转译 TSX 到 CommonJS 并在隔离沙箱执行 */
function load(rel, stubs, extraCode = "") {
  const source = read(rel);
  const js = ts.transpileModule(source, {
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

/** 构造受控 IO：记录所有 fetch 与 toast */
function makeIO() {
  const io = { fetches: [], toasts: [] };
  const toast = {
    success: (m) => io.toasts.push({ level: "success", message: m }),
    error: (m) => io.toasts.push({ level: "error", message: m }),
    warning: (m) => io.toasts.push({ level: "warning", message: m }),
    info: (m) => io.toasts.push({ level: "info", message: m }),
  };
  const stubFetch = async (url, init) => {
    io.fetches.push({ url, method: (init && init.method) || "GET" });
    return new Response(JSON.stringify({ pools: [] }), { status: 200 });
  };
  return { io, toast, stubFetch };
}

const iconStub = new Proxy({}, { get: () => "Icon" });

// ── 1. EnterprisePoolManager：真实组件执行 ──
function runEnterprisePoolManager() {
  const { io, toast, stubFetch } = makeIO();
  const pool = {
    id: "w1", name: "fixture", plan: "PRO", tokenBalance: 100,
    poolLowThreshold: null, planDefault: 500, effectiveThreshold: 500,
  };
  // 按组件内 useState 顺序给出受控初值；useEffect 只执行 loadPools 读取余额
  const stateValues = [[pool], false, "w1", "", undefined, false];
  let stateIndex = 0;
  let effectCount = 0;
  const stubs = {
    react: {
      useCallback: (fn) => fn,
      // 只执行第一个 useEffect（loadPools 读取余额）；第二个是阈值回填，无需在此模拟
      useEffect: (fn) => { effectCount++; if (effectCount === 1) void fn(); },
      useState: () => {
        const v = stateValues[Math.min(stateIndex, stateValues.length - 1)];
        stateIndex++;
        return [v, () => {}];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "lucide-react": { Building2: "Icon", AlertCircle: "Icon" },
    "@/utils/auth": { getAuthToken: () => "fixture" },
    "@/components/Toast": { useToast: () => toast },
    __fetch: stubFetch,
  };
  const mod = load("src/components/EnterprisePoolManager.tsx", stubs);
  stateIndex = 0;
  const tree = mod.default({ className: "", onChanged: () => {} });
  const text = textOf(tree);
  check("C06 EnterprisePoolManager 显示暂停文案", text.includes(PAUSED));
  check("C06 EnterprisePoolManager 无成功到账承诺",
    !text.includes("确认回收") && !text.includes("回收成功") && !text.includes("已回收"));
  const buttons = nodes(tree, (n) => n.type === "button");
  const recycleBtn = buttons.find((b) => textOf(b).includes("暂不可用"));
  check("C06 EnterprisePoolManager 回收控件为禁用", !!recycleBtn && recycleBtn.props.disabled === true);
  // 直接触发防御 handler：不得发起任何转个人请求、不得出现成功 toast
  if (recycleBtn) recycleBtn.props.onClick();
  const recycleFetches = io.fetches.filter((f) => String(f.url).includes("recycle"));
  check("C06 EnterprisePoolManager 防御 handler 不触发转个人请求", recycleFetches.length === 0);
  check("C06 EnterprisePoolManager 无成功 Toast", io.toasts.every((t) => t.level !== "success"));
  // 相邻功能：余额读取与阈值保存入口仍在
  check("C06 EnterprisePoolManager 相邻功能保留（余额读取 + 阈值保存）",
    io.fetches.some((f) => String(f.url).includes("/api/user/enterprise-pools")) &&
    text.includes("低余额预警阈值") && text.includes("保存阈值"));
}

// ── 2. RechargeModal：真实组件执行（recycle 页签） ──
function runRechargeModal() {
  const { io, toast, stubFetch } = makeIO();
  const stubs = {
    react: { useCallback: (fn) => fn, useEffect: () => {}, useState: (i) => [i, () => {}] },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "lucide-react": iconStub,
    "@/components/Toast": { useToast: () => toast },
    "@/hooks/useEscapeKey": { useEscapeKey: () => {} },
    "@/utils/format": { formatNumber: (v) => String(v) },
    "@/lib/point-rate": {
      pointsToYuan: (v) => Number(v) / 100,
      formatYuanFromPoints: (v) => String(v),
      applyMemberDiscount: (v) => Number(v),
      formatDiscountLabel: () => "",
    },
    "@/utils/quota": { isUnlimitedToken: () => false, formatTokenBalance: (v) => String(v) },
    __fetch: stubFetch,
  };
  let mod;
  try {
    mod = load("src/components/workspace/RechargeModal.tsx", stubs);
  } catch (e) {
    check("C06 RechargeModal 模块加载", false, e.message);
    return;
  }
  const props = {
    onClose: () => {}, rechargeTab: "recycle", setRechargeTab: () => {},
    workspaceType: "ENTERPRISE", userRole: "OWNER",
    workspaceQuotaInfo: {
      tokenBalance: 100, levelName: "PRO", levelTokenLimit: 1000,
      totalAllocatedToMembers: 0, unallocatedBalance: 100,
    },
    availableTokenForUser: 100, dynamicTokenPacks: [], selectedRechargePack: null,
    setSelectedRechargePack: () => {}, rechargeMemberDiscount: 0,
    rechargePaymentMethod: "WECHAT", setRechargePaymentMethod: () => {},
    recharging: false, handleExecuteRecharge: () => {},
    offlineForm: {}, setOfflineForm: () => {}, offlineResultOrderNo: null,
    submitOfflineOrder: () => {}, submittingOffline: false,
    poolThresholdInfo: { isCustom: false, planDefault: 500, threshold: 500 },
    poolThresholdInput: "", setPoolThresholdInput: () => {},
    poolThresholdSaving: false, handleSavePoolThreshold: () => {},
    handleExecuteRecycle: () => { io.recycleHandlerCalled = true; },
    officialAccount: null,
  };
  const tree = mod.default(props);
  const text = textOf(tree);
  check("C06 RechargeModal recycle 页签显示暂停文案", text.includes(PAUSED));
  check("C06 RechargeModal 无成功到账/确认回收承诺",
    !text.includes("确认回收至个人钱包") && !text.includes("回收成功") &&
    !text.includes("将企业共享池的算力点回收至您的个人钱包"));
  const buttons = nodes(tree, (n) => n.type === "button");
  const pausedBtn = buttons.find((b) => textOf(b).includes("暂不可用"));
  check("C06 RechargeModal 回收控件为禁用", !!pausedBtn && pausedBtn.props.disabled === true);
  check("C06 RechargeModal 保留低余额阈值编辑与保存",
    text.includes("企业池低余额预警阈值") && text.includes("保存阈值"));
  // 组件渲染不发起任何请求
  check("C06 RechargeModal 渲染不发起转个人请求",
    io.fetches.filter((f) => String(f.url).includes("recycle")).length === 0);
  check("C06 RechargeModal 无成功 Toast", io.toasts.every((t) => t.level !== "success"));
}

// ── 3. V3 handleExecuteRecycle：提取真实源码段执行 ──
function runV3Handler() {
  const src = read("src/components/WorkspaceInternalLayoutV3.tsx");
  const start = src.indexOf("const handleExecuteRecycle = ");
  assert.ok(start > 0, "V3 handler not found");
  const end = src.indexOf("\n  };", start);
  const snippet = src.slice(start, end + 5);
  // 真实 handler 片段必须是暂停防御版：发出暂停提示，且不含任何回收请求
  assert.ok(snippet.includes(PAUSED), "V3 handler must show the paused message");
  assert.ok(!snippet.includes("fetch("), "V3 handler must not issue any recycle request");
  const io = { toasts: [], fetches: [] };
  const toast = {
    success: (m) => io.toasts.push({ level: "success", message: m }),
    error: (m) => io.toasts.push({ level: "error", message: m }),
    warning: (m) => io.toasts.push({ level: "warning", message: m }),
    info: (m) => io.toasts.push({ level: "info", message: m }),
  };
  const sandbox = {
    toast,
    fetch: async (url) => { io.fetches.push(String(url)); return new Response("{}", { status: 200 }); },
    getAuthToken: () => "fixture",
    workspaceId: "w1", recyclePoints: "100", setRecycling: () => {},
    setRecyclePoints: () => {}, setRechargeSignal: () => {}, setWorkspaceToken: () => {},
    Number, Math, JSON, Error,
  };
  vm.runInNewContext(snippet + "\nhandleExecuteRecycle();", sandbox, { filename: "V3#handleExecuteRecycle" });
  check("C06 V3 handler 不发起转个人请求",
    io.fetches.filter((u) => u.includes("recycle")).length === 0);
  check("C06 V3 handler 不显示成功 Toast", io.toasts.every((t) => t.level !== "success"));
  check("C06 V3 handler 给出暂停提示",
    io.toasts.some((t) => t.level === "info" && t.message.includes(PAUSED)));
}

// ── 4. 旧页面/直接 HTTP 仍由后端拒绝（源码契约核对） ──
function checkServerContract() {
  const svc = read("src/lib/credit-service.ts");
  const w = read("src/app/api/workspace/quota/recycle/route.ts");
  const a = read("src/app/api/admin/workspaces/recycle/route.ts");
  check("C06 服务层兜底存在于事务/业务写之前",
    /export async function recycleEnterprisePool[\s\S]{0,900}?throw new Error\(ENTERPRISE_POOL_RECYCLE_DISABLED\)/.test(svc) &&
    !/prisma\.\$transaction[\s\S]{0,400}?recycleEnterprisePool/.test(svc));
  check("C06 两个 API 均为 409 + success:false + 稳定 code",
    (w.match(/status: 409/g) || []).length >= 2 &&
    (a.match(/status: 409/g) || []).length >= 2 &&
    w.includes("ENTERPRISE_POOL_RECYCLE_DISABLED") && a.includes("ENTERPRISE_POOL_RECYCLE_DISABLED"));
  check("C06 两个 API 不再有成功账务/成功通知",
    !w.includes("已成功回收") && !a.includes("已成功将") &&
    !w.includes("workspace:pool_recycle") && !a.includes("admin:workspace_pool_recycle") &&
    !w.includes("addNotification"));
}

async function main() {
  console.log("=== R0-C C06 页面组件级验证（真实组件/handler 受控执行）===");
  runEnterprisePoolManager();
  runRechargeModal();
  runV3Handler();
  checkServerContract();
  const failed = results.filter((r) => !r.ok);
  console.log(`\nRESULT: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.error("FAILED:", failed.map((f) => f.name)); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
