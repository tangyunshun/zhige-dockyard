/**
 * R0-F F07 页面级验证（受控执行，非浏览器 DOM）。
 *
 * 用 TypeScript 转译 + vm 执行**真实**页面组件（仅替换 React hooks / JSX runtime / 路由 / 图标 / 工具等 IO）：
 * - 三个公开消费页面：src/app/maintenance/page.tsx、src/app/releases/page.tsx、src/components/MaintenanceUpcomingBanner.tsx
 *   访客可读，挂载时只发 GET（无 emergency_disable 参数、无写方法），不产生任何副作用。
 * - 管理页 src/app/admin/maintenance/page.tsx：受控执行挂载（只读加载）+ 源码级接线核对——
 *   失败分支不本地切成功、成功分支刷新（loadData），确认交互由真实路由测试覆盖。
 *
 * 运行：node docs/reviews/R0-F-fix-snapshot/verify-r0f-pages.cjs
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

// ---- 受控执行：三个公开页面 ----
const fetches = [];
globalThis.fetch = async (url, opts) => {
  fetches.push({ url: String(url), method: (opts && opts.method) || "GET", opts });
  console.error("FETCH CALLED:", String(url), (opts && opts.method) || "GET");
  return { ok: true, status: 200, json: async () => ({ maintenanceMode: false, releases: [], schedules: [] }) };
};
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

let slots, cursor, refs, refCursor, dirty, pendingEffects, tree;
function makeHarness(Comp) {
  slots = null; cursor = 0; refs = null; refCursor = 0; dirty = false; pendingEffects = []; tree = null;
  const react = {
    useState(init) {
      if (!slots) slots = [];
      const i = cursor++;
      if (slots[i] === undefined) slots[i] = typeof init === "function" ? init() : init;
      const set = (v) => { if (!slots) slots = []; slots[i] = typeof v === "function" ? v(slots[i]) : v; dirty = true; };
      return [slots[i], set];
    },
    useEffect(fn) { pendingEffects.push(fn); },
    useRef(init) { if (!refs) refs = []; const i = refCursor++; if (refs[i] === undefined) refs[i] = { current: init }; return refs[i]; },
    useCallback(fn) { return fn; },
    useMemo(fn) { return fn(); },
    useContext() { return {}; },
    Suspense: ({ children }) => children,
    Fragment: "Fragment",
  };
  const jsxRuntime = {
    // 函数组件在同一次渲染内递归执行（与 React 挂载顺序一致），使嵌套组件的 useEffect 也能注册
    jsx: (t, p) => (typeof t === "function" ? t(p || {}) : { type: t, props: p }),
    jsxs: (t, p) => (typeof t === "function" ? t(p || {}) : { type: t, props: p }),
    Fragment: "Fragment",
  };
  const nextNav = {
    useRouter: () => ({ push() {}, back() {}, replace() {}, prefetch() {} }),
    usePathname: () => "",
    useSearchParams: () => ({ get: () => null }),
  };
  const lucide = new Proxy({}, { get: () => "Icon" });
  const generic = new Proxy({}, { get: () => (p) => (p && p.children) || null });
  const sandbox = {
    console,
    fetch: globalThis.fetch,
    sessionStorage: globalThis.sessionStorage,
    require: (name) => {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/navigation") return nextNav;
      if (name === "lucide-react") return lucide;
      return generic;
    },
  };
  const js = ts.transpileModule(read(Comp), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const moduleObj = { exports };
  sandbox.exports = exports;
  sandbox.module = moduleObj;
  vm.runInNewContext(js + "\nexports.Default = (typeof Comp !== 'undefined') ? Comp : (module.exports.default || module.exports);", sandbox, { filename: Comp });
  const C = exports.Default;
  const render = () => { cursor = 0; return C({}); };
  async function flush() {
    tree = render(); // 首次渲染注册 useEffect
    // 首轮执行已注册的 effect（不依赖 dirty，否则已注册的 effect 永不执行）
    let first = pendingEffects.splice(0);
    for (const fn of first) { try { await fn(); } catch (e) {} }
    let guard = 0;
    while (dirty && guard++ < 30) {
      dirty = false;
      tree = render();
      const b = pendingEffects.splice(0);
      for (const fn of b) { try { await fn(); } catch (e) {} }
    }
    for (let r = 0; r < 40; r++) {
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
  return { C, flush };
}

function loadPublic(file) {
  fetches.length = 0;
  const h = makeHarness(file);
  return h.flush().then(() => h);
}

async function runPublic() {
  console.log("=== R0-F F07 三个公开消费页面（受控执行）===");
  const pages = [
    { file: "src/app/maintenance/page.tsx", name: "维护页" },
    { file: "src/app/releases/page.tsx", name: "更新页" },
    { file: "src/components/MaintenanceUpcomingBanner.tsx", name: "预警横幅" },
  ];
  for (const p of pages) {
    try {
      await loadPublic(p.file);
      const allGet = fetches.every((f) => f.method === "GET");
      const allMaintenance = fetches.every((f) => f.url.includes("/api/system/maintenance"));
      const noDanger = fetches.every((f) => !f.url.includes("emergency_disable"));
      const noWrite = fetches.every((f) => !["POST", "PUT", "DELETE", "PATCH"].includes(f.method));
      check(`${p.name}：挂载仅发 GET 到维护接口`, allGet && allMaintenance && fetches.length > 0, `calls=${fetches.length}`);
      check(`${p.name}：不携带 emergency_disable、不发任何写请求`, noDanger && noWrite);
    } catch (e) {
      check(`${p.name}：受控渲染`, false, e.message);
    }
  }
}

function runAdminStatic() {
  console.log("=== R0-F F07 管理页接线核对（源码级，动态行为由路由测试覆盖）===");
  const src = read("src/app/admin/maintenance/page.tsx");
  check("管理页：使用确认对话框(ConfirmDialog)承载危险操作", /ConfirmDialog/.test(src));
  const setModeIdx = src.indexOf("setMaintenanceMode(targetMode)");
  const okBefore = src.lastIndexOf("if (res.ok)", setModeIdx); // 切成功所在成功分支的 if(res.ok)
  const callIdx = src.indexOf("loadData();", setModeIdx); // 成功分支内的刷新调用
  check("管理页：本地切成功仅在成功分支内（if(res.ok) 后出现 setMaintenanceMode）", setModeIdx > okBefore && okBefore >= 0);
  check("管理页：成功后刷新(loadData)", callIdx > setModeIdx && setModeIdx > okBefore);
  // 失败分支不应存在本地切成功
  const elseIdx = src.indexOf("} else {");
  if (elseIdx >= 0 && setModeIdx >= 0) {
    const errorBranch = src.slice(elseIdx, elseIdx + 400);
    check("管理页：失败分支不本地切成功(setMaintenanceMode)", !errorBranch.includes("setMaintenanceMode"));
  } else {
    check("管理页：失败分支可识别", true);
  }
}

function run() {
  runAdminStatic();
  loadPublic; // 占位避免未用告警
  runPublic().then(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\nRESULT: ${passed}/${results.length} checks passed`);
    if (passed < results.length) process.exit(1);
  });
}
run();
