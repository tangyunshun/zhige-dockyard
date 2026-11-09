// [R0-J2 §5 J-PARTIAL] 实际回调行为验证：AST 提取两处批量回调 → transpile → 合成 fetch/状态执行
// 场景：全成功 200 / 部分成功 207 / 权限拒绝 403 / 服务错误 500 / 缺成功集合
// 断言：仅移除实际成功项；失败/跳过/无关条目保留；HTTP 错误不修改列表且按错误提示
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm'), assert = require('node:assert/strict'), path = require('node:path');
const p = 'src/components/WorkspaceInternalLayoutV3.tsx';
const source = fs.readFileSync(p, 'utf8');
const ast = ts.createSourceFile(p, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const found = {};
function visit(n) {
  if (ts.isVariableDeclaration(n) && ['handleBatchDeleteAssets', 'handleBatchRemoveAssets'].includes(n.name.getText(ast))) {
    found[n.name.getText(ast)] = n.initializer.getText(ast);
  }
  ts.forEachChild(n, visit);
}
visit(ast);

async function run(name, mode) {
  // 初始三类条目：成功 / 失败 / 无关
  let rows = [{ id: 'ok-item' }, { id: 'fail-item' }, { id: 'unrelated' }];
  const toasts = [];
  const status = mode === 'denied' ? 403 : mode === 'server-error' ? 500 : mode === 'partial' ? 207 : 200;
  const partialFailed = [{ id: 'fail-item', reason: 'synthetic failure' }];
  const body = mode === 'denied' || mode === 'server-error'
    ? { success: false, error: 'synthetic ' + mode }
    : mode === 'missing-collection'
      ? { success: true, count: 0 /* 未提供 succeededIds/failed 集合 */ }
      : {
          success: mode === 'success',
          count: mode === 'success' ? 2 : 1,
          succeededIds: mode === 'success' ? ['ok-item', 'fail-item'] : ['ok-item'],
          failed: mode === 'partial' ? partialFailed : [],
          data: { removedCount: mode === 'success' ? 2 : 1, succeededIds: mode === 'success' ? ['ok-item', 'fail-item'] : ['ok-item'], failed: mode === 'partial' ? partialFailed : [] },
        };
  const sandbox = {
    module: { exports: {} },
    workspaceId: 'w1',
    getAuthToken: () => null,
    confirm: async () => true,
    fetch: async () => ({ ok: status < 300, status, json: async () => body }),
    setAssets: (f) => { rows = f(rows); },
    toast: Object.fromEntries(['success', 'error', 'warning', 'info'].map((k) => [k, (m) => toasts.push({ kind: k, message: String(m) })])),
    console: { error: () => {} },
  };
  const code = ts.transpileModule('const callback=' + found[name] + ';module.exports=callback;', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, sandbox);
  let threw = null;
  try { await sandbox.module.exports(mode === 'success' ? ['ok-item', 'fail-item'] : ['ok-item', 'fail-item'], 'VIOLATION', ''); }
  catch (e) { threw = String(e && e.message || e); }
  const visible = rows.map((r) => r.id);
  let expectedVisible, expectedToastKind;
  if (mode === 'partial') { expectedVisible = ['fail-item', 'unrelated']; expectedToastKind = 'warning'; } // 仅移除成功项
  else if (mode === 'success') { expectedVisible = ['unrelated']; expectedToastKind = 'success'; }
  else if (mode === 'missing-collection') { expectedVisible = ['ok-item', 'fail-item', 'unrelated']; expectedToastKind = null; } // 缺集合：不把请求 ID 当成功 → 列表不动
  else { expectedVisible = ['ok-item', 'fail-item', 'unrelated']; expectedToastKind = 'error'; } // HTTP 错误：列表不动
  assert.deepEqual(visible, expectedVisible, name + '/' + mode + ' 列表状态不符: ' + visible);
  if (expectedToastKind) {
    assert(toasts.some((t) => t.kind === expectedToastKind), name + '/' + mode + ' 缺少 ' + expectedToastKind + ' 提示');
  }
  return { name, mode, status, threw, visibleIds: visible, toasts };
}

(async () => {
  const observations = [];
  for (const name of ['handleBatchDeleteAssets', 'handleBatchRemoveAssets']) {
    for (const mode of ['success', 'partial', 'denied', 'server-error', 'missing-collection']) {
      observations.push(await run(name, mode));
    }
  }
  const out = path.join(__dirname, 'ui-verification.json');
  fs.writeFileSync(out, JSON.stringify({
    capturedAt: new Date().toISOString(),
    scenarioCount: observations.length,
    observations,
    limits: 'Actual callbacks via AST/transpile + synthetic fetch/state; no browser DOM. R0-J2 §5: only succeededIds removed; failed/skipped/unrelated retained; 401/403/5xx leave list untouched with error toast; missing success collection treated as empty (never all-requested-as-success).',
  }, null, 2));
  console.log('PASS: ' + observations.length + ' callback scenarios (2 callbacks x 5 states) verified, exit 0');
})().catch((e) => { console.error(e); process.exitCode = 1; });
