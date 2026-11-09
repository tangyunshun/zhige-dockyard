// [R0-J3 §一.6] 实际回调行为验证：AST 提取两处批量回调 → transpile → 合成 fetch/状态执行
// 场景：原 200/207/403/500 列表行为不回归 + 新增待清理/共享保留提示如实呈现
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
  let rows = [{ id: 'ok-item' }, { id: 'fail-item' }, { id: 'unrelated' }];
  const toasts = [];
  const status = mode === 'denied' ? 403 : mode === 'server-error' ? 500 : mode === 'partial' || mode === 'shared-retained' ? 207 : 200;
  const partialFailed = [{ id: 'fail-item', reason: 'synthetic failure' }];
  const sharedRetainedIds = mode === 'shared-retained' ? ['ok-item'] : [];
  const cleanupPendingIds = mode === 'cleanup-pending' ? ['ok-item'] : [];
  const body = mode === 'denied' || mode === 'server-error'
    ? { success: false, error: 'synthetic ' + mode }
    : {
        success: mode !== 'partial' && mode !== 'shared-retained',
        count: 1,
        succeededIds: ['ok-item'],
        failed: mode === 'partial' ? partialFailed : [],
        cleanupPendingIds,
        sharedRetainedIds,
        data: { removedCount: 1, succeededIds: ['ok-item'], failed: mode === 'partial' ? partialFailed : [], cleanupPendingIds, sharedRetainedIds },
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
  try { await sandbox.module.exports(['ok-item', 'fail-item'], 'VIOLATION', ''); }
  catch (e) { threw = String(e && e.message || e); }
  const visible = rows.map((r) => r.id);
  const messages = toasts.map((t) => t.kind + ':' + t.message);
  // 断言
  if (mode === 'denied' || mode === 'server-error') {
    assert.deepEqual(visible, ['ok-item', 'fail-item', 'unrelated'], name + '/' + mode + ' 列表不应被修改');
    assert(toasts.some((t) => t.kind === 'error'), name + '/' + mode + ' 应有错误提示');
  } else if (mode === 'partial') {
    assert.deepEqual(visible, ['fail-item', 'unrelated'], name + '/partial 仅移除成功项');
    assert(toasts.some((t) => t.kind === 'warning'), name + '/partial 应有部分失败提示');
  } else if (mode === 'cleanup-pending') {
    assert.deepEqual(visible, ['fail-item', 'unrelated'], name + '/cleanup-pending 仅移除成功项');
    assert(messages.some((m) => m.startsWith('warning:') && m.includes('物理清理待完成') && m.includes('占用保持计量')), name + '/cleanup-pending 应提示待清理与占用状态');
  } else if (mode === 'shared-retained') {
    assert.deepEqual(visible, ['fail-item', 'unrelated'], name + '/shared-retained 仅移除成功项');
    assert(messages.some((m) => m.startsWith('warning:') && m.includes('共享引用保留')), name + '/shared-retained 应提示共享保留');
  } else {
    assert.deepEqual(visible, ['fail-item', 'unrelated'], name + '/success 仅移除成功项');
    assert(toasts.some((t) => t.kind === 'success'), name + '/success 应有成功提示');
  }
  return { name, mode, status, threw, visibleIds: visible, toasts: messages };
}

(async () => {
  const observations = [];
  for (const name of ['handleBatchDeleteAssets', 'handleBatchRemoveAssets']) {
    for (const mode of ['success', 'partial', 'denied', 'server-error', 'cleanup-pending', 'shared-retained']) {
      observations.push(await run(name, mode));
    }
  }
  const out = path.join(__dirname, 'ui-verification.json');
  fs.writeFileSync(out, JSON.stringify({
    capturedAt: new Date().toISOString(),
    scenarioCount: observations.length,
    observations,
    limits: 'Actual callbacks via AST/transpile + synthetic fetch/state; no browser DOM. R0-J3 §一.6: pending cleanup / shared-retained states surfaced as warnings (occupancy retained); original 200/207/403/500 list behaviors unchanged.',
  }, null, 2));
  console.log('PASS: ' + observations.length + ' callback scenarios (2 callbacks x 6 states) verified, exit 0');
})().catch((e) => { console.error(e); process.exitCode = 1; });
