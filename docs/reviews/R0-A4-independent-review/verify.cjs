// Independent offline audit: execute actual source, replace every persistence/external IO boundary.
// Historical counterexample evidence, not the post-fix regression suite.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const dir = 'docs/reviews/R0-A4-independent-review';
const hashes = {};
function read(file) {
  const source = fs.readFileSync(file, 'utf8');
  hashes[file] = crypto.createHash('sha256').update(source).digest('hex');
  return source;
}
function load(file, stubs) {
  const js = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Response, Headers, Date, JSON, Error,
    console: { log() {}, error() {} },
    require: name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name === 'crypto') return crypto;
      throw new Error('Unstubbed dependency: ' + name);
    },
  }, { filename: file });
  return exports;
}
const constants = load('src/constants/workspace-plans.ts', {});
const limits = load('src/lib/limit-utils.ts', {});
function row(changes = {}) {
  return { key: 'STANDARD', name: 'Fixture plan', description: '', isActive: true, purchasable: true,
    priceMonthly: 0, priceYearly: 0, maxMembers: 2, maxComponents: 2, maxStorage: 100,
    maxApiCalls: 100, sortOrder: 20, trialGift: { enabled: false, points: 0, expireDays: 0 }, ...changes };
}
function setup(first, later = first, options = {}) {
  const initial = { id: 'ws1', ownerId: 'u1', name: 'Personal', type: 'PERSONAL', plan: 'FREE', workspacequotaId: 'q1' };
  const s = { workspaces: { ws1: initial }, writes: [], calls: [], bills: [], reads: 0, livePlan: first, assets: [{ id: 'asset1', workspaceId: 'ws1' }], quotas: [] };
  const quota = { id: 'q1', workspaceId: 'ws1', membershipLevelId: 'FREE', tokenBalance: 0n };
  const level = { id: 'FREE', maxEnterpriseWorkspaces: 2, maxStorage: 0n, maxApiCalls: 0n, tokenLimit: 0n };
  function write(table, method, args) { s.writes.push({ table, method, data: args.data, where: args.where }); }
  const prisma = {
    workspaceplan: { findUnique: async ({ where }) => {
      s.reads++; const current = s.livePlan;
      return current && current.key === where.key ? { ...current } : null;
    } },
    workspace: {
      findUnique: async ({ where }) => s.workspaces[where.id] ? { ...s.workspaces[where.id] } : null,
      findMany: async () => [],
      update: async args => { write('workspace', 'update', args); Object.assign(s.workspaces[args.where.id], args.data); return s.workspaces[args.where.id]; },
      create: async args => { write('workspace', 'create', args); s.workspaces[args.data.id] = { ...args.data }; return s.workspaces[args.data.id]; },
      deleteMany: async args => { write('workspace', 'deleteMany', args); delete s.workspaces[args.where.id]; return { count: 1 }; },
    },
    workspacemember: {
      create: async args => { write('workspacemember', 'create', args); return args.data; },
      deleteMany: async args => { write('workspacemember', 'deleteMany', args); return { count: 1 }; },
    },
    user: { findUnique: async () => ({ id: 'u1', name: 'User', membershipLevel: 'FREE', role: 'USER' }) },
    membershiplevel: { findUnique: async () => level, findFirst: async () => level },
    platformdefaultmodel: { findMany: async () => [] },
    workspacequota: { findUnique: async ({ where }) => (where.id === 'q1' || where.workspaceId === 'ws1') ? quota : null,
      create: async args => { write('workspacequota', 'create', args); s.quotas.push(args.data); return args.data; },
      update: async args => { write('workspacequota', 'update', args); s.quotas.push(args.data); return { ...quota, ...args.data }; } },
    workspace_model_policy: { findUnique: async () => ({ id: 'policy' }) },
    operationlog: { create: async args => { write('operationlog', 'create', args); return args.data; } },
    billingrecord: { create: async ({ data }) => { s.bills.push(data); return data; },
      findUnique: async ({ where }) => s.bills.find(b => b.id === where.id) || null },
  };
  prisma.$transaction = async fn => {
    if (typeof fn !== 'function') return await Promise.all(fn);
    return fn(prisma);
  };
  for (const table of ['asset', 'conversation', 'document', 'integration', 'project', 'operationlog', 'workspacepost', 'postmember', 'workspacekickhistory', 'workspaceinvitation', 'workspace_byo_model', 'user_byo_model_assignment', 'modelapplication', 'workspace_member_model_preference', 'quotaapply', 'componentusage', 'workspacemember', 'componenttask']) {
    prisma[table] ||= {};
    prisma[table].updateMany = async args => {
      write(table, 'updateMany', args);
      if (table === 'asset') for (const asset of s.assets) if (asset.workspaceId === args.where.workspaceId) asset.workspaceId = args.data.workspaceId;
      return { count: table === 'asset' ? 1 : 0 };
    };
  }
  const planService = load('src/lib/workspace-plan-service.ts', { '@/lib/prisma': { prisma }, '@/constants/workspace-plans': constants });
  const upgrades = load('src/lib/workspace-upgrade-service.ts', {
    '@/lib/prisma': { prisma }, '@/lib/workspace-plan-service': planService,
    '@/lib/workspace-naming': { generateEnterpriseWorkspaceName: async () => { if (options.changeDuringName) { s.livePlan = later; s.calls.push({ kind: 'fixture_config_change' }); } return 'Fixture enterprise'; } },
    '@/lib/new-space-trial-quota': { grantNewSpaceTrialQuota: async params => { s.calls.push({ kind: 'trial', overrides: params.overrides }); return { granted: params.overrides.points }; } },
    '@/lib/personal-gift-migration': { migratePersonalGiftToEnterprisePool: async () => { s.calls.push({ kind: 'gift_migration' }); if (options.failGift) throw new Error('INJECTED_GIFT_IO_FAILURE'); return { migrated: 0 }; } },
    '@/constants/workspace-plans': constants, '@/lib/limit-utils': limits,
  });
  const route = load('src/app/api/workspace/upgrade/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/prisma': { prisma }, '@/lib/workspace-plan-service': planService,
    '@/lib/auth': { validateUser: async () => ({ valid: true, user: { id: 'u1', role: 'USER' } }), isAdminRole: () => false },
    '@/lib/workspace-readonly-guard': { assertWorkspaceWritable: async () => {} },
    '@/lib/payment-gateway': { resolvePaymentMode: () => 'MOCK', createCharge: async data => {
      s.calls.push({ kind: 'charge', amount: data.amountCents }); return { mode: 'MOCK', payUrl: '/isolated-checkout' };
    } },
    '@/constants/workspace-plans': constants, '@/lib/order-expiry': { newOrderExpiry: () => new Date(Date.now() + 60000) },
    '@/lib/workspace-upgrade-service': upgrades,
  });
  return { s, route, upgrades };
}
async function run(name, first, later = first, body = {}, options = {}) {
  const { s, route } = setup(first, later, options);
  const response = await route.POST({ headers: new Headers({ authorization: 'Bearer isolated' }),
    json: async () => ({ workspaceId: 'ws1', option: 'upgrade', billingCycle: 'MONTH', targetPlan: first?.key || 'STANDARD', ...body }) });
  return { scenario: name, status: response.status, response: await response.json(), planReads: s.reads,
    finalWorkspaces: Object.values(s.workspaces).map(w => ({ id: w.id, type: w.type, status: w.status, plan: w.plan, maxMembers: w.quota?.maxMembers })),
    writes: s.writes.map(w => ({ table: w.table, method: w.method })),
    livePlan: s.livePlan, assets: s.assets.map(a => ({ ...a, workspaceExists: !!s.workspaces[a.workspaceId] })), quotas: s.quotas.map(q => ({ storageLimit: String(q.storageLimit), enterpriseSlots: String(q.enterpriseSlots) })), bills: s.bills.map(b => ({ amount: b.amount, status: b.status })), calls: s.calls };
}
async function ui(file, handlerName, payload, options = {}) {
  const source = read(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === handlerName) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(initializer, 'handler must exist');
  const result = { file, payload, success: [], info: [], errors: [], storageWrites: [], completedCallbacks: 0, closed: 0, navigations: [] };
  const context = {
    setLoading() {}, selectedOption: 'upgrade', option: 'upgrade', personalWorkspace: { id: 'ws1' },
    quota: { enterpriseCount: 0, maxEnterprise: 2 }, workspaceId: 'ws1', targetPlan: 'STANDARD', billingCycle: 'MONTH',
    getAuthToken: () => 'isolated',
    localStorage: { getItem: () => 'isolated', setItem: (k, v) => result.storageWrites.push([k, v]), removeItem() {} },
    window: { location: { href: '' } }, router: { push: path => result.navigations.push(path) },
    setTimeout: fn => fn(),
    fetch: async url => { if (url === '/api/auth/me') return { ok: true }; if (options.networkError) throw new Error('INJECTED_NETWORK'); return { ok: options.ok !== false, json: async () => payload }; },
    toast: { success: m => result.success.push(m), error: m => result.errors.push(m), info: m => result.info.push(m) },
    onSuccess: () => result.completedCallbacks++, onUpgradeSuccess: () => result.completedCallbacks++, onClose: () => result.closed++,
  };
  const js = ts.transpileModule('(' + initializer.getText(tree) + ')', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const handler = vm.runInNewContext(js, { ...context, Error, console: { error() {} } }, { filename: file + ':extracted-handler' });
  await handler();
  result.redirect = context.window.location.href;
  return result;
}
async function directDelete(source) {
  const { s, upgrades } = setup(row(), row(), { failGift: true });
  let error = null;
  try {
    await upgrades.provisionEnterpriseUpgrade({ personalWorkspaceId: 'ws1', userId: 'u1', option: 'delete',
      targetPlanKey: 'STANDARD', billingCycle: 'MONTH', source });
  } catch (e) { error = e.message; }
  return { scenario: 'direct_provision_delete_' + source, error, writes: s.writes.map(w => ({ table: w.table, method: w.method })),
    workspaces: Object.keys(s.workspaces), assets: s.assets.map(a => ({ ...a, workspaceExists: !!s.workspaces[a.workspaceId] })),
    bills: s.bills.map(b => ({ amount: b.amount, status: b.status })) };
}
(async () => {
  const controls = [];
  for (const option of ['upgrade', 'retain']) {
    const r = await run('stable_free_' + option, row(), row(), { option });
    assert.equal(r.status, 200);
    assert.equal(r.response.free, true);
    assert.equal(r.finalWorkspaces.find(w => w.type === 'ENTERPRISE').maxMembers, 2);
    assert.equal(r.quotas[0].enterpriseSlots, '2');
    assert.deepEqual(r.bills, [{ amount: 0, status: 'SUCCESS' }]);
    controls.push(r);
  }
  for (const target of [row(), row({ key: 'PRO', priceMonthly: 19900, priceYearly: 199000 })]) {
    const r = await run('route_delete_rejected_' + target.key, target, target, { option: 'delete' });
    assert.equal(r.status, 400);
    assert.equal(r.response.error, 'MIGRATION_OPTION_UNAVAILABLE');
    assert.equal(r.writes.length, 0);
    assert.equal(r.bills.length, 0);
    controls.push(r);
  }
  for (const [name, later] of [
    ['price_change', row({ priceMonthly: 19900, priceYearly: 199000 })],
    ['inactive', row({ isActive: false })],
  ]) {
    const r = await run('upgrade_' + name + '_rejects_before_write', row(), later, {}, { changeDuringName: true });
    assert.ok(r.status >= 400);
    assert.equal(r.writes.length, 0);
    assert.equal(r.bills.length, 0);
    controls.push(r);
  }
  const rejectedDirect = await directDelete('SELF_SERVICE_PURCHASE');
  assert.equal(rejectedDirect.error, 'MIGRATION_OPTION_UNAVAILABLE');
  assert.equal(rejectedDirect.writes.length, 0);
  controls.push(rejectedDirect);
  const historical = setup(row());
  historical.s.bills.push({ id: 'pending_delete', type: 'PLAN_UPGRADE', status: 'PENDING', userId: 'u1', metadata: { option: 'delete' } });
  await assert.rejects(() => historical.upgrades.fulfillEnterpriseUpgradeFromOrder('pending_delete'), /MIGRATION_OPTION_UNAVAILABLE/);
  assert.equal(historical.s.writes.length, 0);
  assert.equal(historical.s.bills[0].status, 'PENDING');
  controls.push({ scenario: 'historical_pending_delete_blocked', writes: 0, originalOrderStatus: 'PENDING' });

  const observations = [];
  const drift = await run('resource_and_gift_change_accepted', row(), row({ maxMembers: 99, maxStorage: 900,
    trialGift: { enabled: true, points: 777, expireDays: 30 } }), {}, { changeDuringName: true });
  assert.equal(drift.status, 200);
  assert.equal(drift.response.free, true);
  assert.equal(drift.finalWorkspaces[0].maxMembers, 99);
  assert.equal(drift.quotas[0].enterpriseSlots, '99');
  assert.ok(drift.calls.some(c => c.kind === 'trial' && c.overrides.points === 777));
  observations.push(drift);
  for (const [name, later] of [
    ['price_change', row({ priceMonthly: 19900, priceYearly: 199000 })],
    ['inactive', row({ isActive: false })],
  ]) {
    const r = await run('retain_' + name + '_writes_then_cleans_before_reject', row(), later,
      { option: 'retain' }, { changeDuringName: true });
    assert.ok(r.status >= 400);
    assert.ok(r.writes.some(w => w.table === 'workspace' && w.method === 'create'));
    assert.ok(r.writes.some(w => w.table === 'workspacemember' && w.method === 'create'));
    assert.equal(r.finalWorkspaces.length, 1);
    observations.push(r);
  }
  for (const source of ['ADMIN_MANUAL', 'SALES_SIGNUP']) {
    const r = await directDelete(source);
    assert.equal(r.error, 'INJECTED_GIFT_IO_FAILURE');
    assert.equal(r.assets[0].workspaceExists, false);
    assert.ok(r.writes.some(w => w.table === 'asset' && w.method === 'updateMany'));
    observations.push(r);
  }

  const uiResults = [];
  for (const [file, name] of [
    ['src/app/workspace/upgrade/page.tsx', 'handleSubmit'],
    ['src/components/studio/UpgradeModal.tsx', 'handleUpgrade'],
    ['src/components/workspace-hub/modals/UpgradeModal.tsx', 'handleUpgrade'],
  ]) {
    for (const [scenario, payload, options] of [
      ['checkout', { success: true, orderNo: 'pending', payUrl: '/isolated-checkout' }, {}],
      ['free_complete', { success: true, free: true, workspaceId: 'ws1' }, {}],
      ['pending_without_checkout', { success: true, orderNo: 'pending' }, {}],
      ['business_failure', { success: false, message: 'fixture failure' }, {}],
      ['HTTP_failure', { success: false, message: 'fixture failure' }, { ok: false }],
      ['network_failure', {}, { networkError: true }],
      ['failure_with_free', { success: false, free: true, workspaceId: 'ws1' }, {}],
      ['free_without_workspace', { success: true, free: true }, {}],
      ['failure_with_checkout', { success: false, payUrl: '/isolated-checkout', message: 'fixture failure' }, {}],
    ]) {
      const r = await ui(file, name, payload, options);
      r.scenario = scenario;
      if (['pending_without_checkout', 'failure_with_free', 'free_without_workspace'].includes(scenario)) {
        assert.equal(r.completedCallbacks, 0);
        assert.equal(r.storageWrites.length, 0);
      }
      if (scenario === 'failure_with_checkout' && name === 'handleSubmit') assert.equal(r.redirect, '/isolated-checkout');
      uiResults.push(r);
    }
  }
  for (const file of ['src/app/api/__tests__/r0a4-combo-regression.test.ts', 'docs/reviews/R0-A4-fix-report.md']) read(file);
  const data = { capturedAt: new Date().toISOString(), controls, observations, uiResults,
    isolation: 'Actual route/strict reader/provision/upgrade/move functions and extracted actual page handlers; all persistence and external IO are local stubs. Trial function records overrides only, no actual credit granted. Gift migration IO deliberately fails after actual move function in internal ADMIN/SALES scenarios.',
    limits: 'Memory IO does not prove MySQL constraints/concurrency or production incidents. ADMIN/SALES direct provision inputs are internal service tests; current production callers found are public self-service route and order fulfillment, which reject delete. No public bypass is demonstrated. UI malformed responses are defensive contract tests.',
    sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ controls: controls.length, observations, uiChecks: uiResults.length,
    pageFailureWithCheckout: uiResults.find(r => r.scenario === 'failure_with_checkout' && r.file.includes('/page.tsx')) }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
