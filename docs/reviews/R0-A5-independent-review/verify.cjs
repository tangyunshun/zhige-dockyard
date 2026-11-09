// Independent offline audit: execute actual source, replace every persistence/external IO boundary.
// Current acceptance checks using real business source and stub-only IO.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const dir = 'docs/reviews/R0-A5-independent-review';
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
const protocol = load('src/lib/upgrade-response-protocol.ts', {});
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
      s.reads++; if (options.changeOnRead === s.reads) s.livePlan = later; const current = s.livePlan;
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
    resolveUpgradeResponse: protocol.resolveUpgradeResponse, setLoading() {}, selectedOption: 'upgrade', option: 'upgrade', personalWorkspace: { id: 'ws1' },
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
(async () => {
  const controls = [];
  const record = r => { controls.push(r); return r; };
  for (const option of ['upgrade', 'retain']) {
    const r = record(await run('stable_free_' + option, row(), row(), { option }));
    assert.equal(r.status, 200);
    assert.equal(r.response.free, true);
    assert.equal(r.finalWorkspaces.find(w => w.type === 'ENTERPRISE').maxMembers, 2);
    assert.equal(r.quotas[0].enterpriseSlots, '2');
    assert.deepEqual(r.bills, [{ amount: 0, status: 'SUCCESS' }]);
    assert.equal(r.calls.length, 0);
  }
  const mutations = [
    ['price', { priceMonthly: 19900, priceYearly: 199000 }],
    ['members', { maxMembers: 99 }], ['storage', { maxStorage: 900 }],
    ['components', { maxComponents: 777 }], ['api_calls', { maxApiCalls: 999 }],
    ['features', { features: ['advanced_export'] }],
    ['gift_enabled', { trialGift: { enabled: true, points: 0, expireDays: 0 } }],
    ['gift_points', { trialGift: { enabled: false, points: 777, expireDays: 0 } }],
    ['gift_expiry', { trialGift: { enabled: false, points: 0, expireDays: 365 } }],
    ['name', { name: 'Changed invoice label' }],
  ];
  for (const option of ['upgrade', 'retain']) for (const [name, change] of mutations) {
    const r = record(await run('change_' + name + '_' + option, row(), row(change), { option }, { changeOnRead: 2 }));
    assert.equal(r.status, 409);
    assert.equal(r.response.error, 'PLAN_CONFIG_CHANGED');
    assert.ok(r.response.message.includes('套餐配置'));
    assert.equal(r.writes.length, 0);
    assert.equal(r.bills.length, 0);
    assert.equal(r.calls.length, 0);
  }
  for (const option of ['upgrade', 'retain']) for (const [name, later, status] of [
    ['inactive', row({ isActive: false }), 400],
    ['not_purchasable', row({ purchasable: false }), 400],
    ['missing', null, 400], ['invalid_price', row({ priceMonthly: -1 }), 400],
  ]) {
    const r = record(await run(name + '_' + option, row(), later, { option }, { changeOnRead: 2 }));
    assert.equal(r.status, status);
    assert.equal(r.writes.length, 0);
    assert.equal(r.bills.length, 0);
  }
  for (const source of ['SELF_SERVICE_PURCHASE', 'ADMIN_MANUAL', 'SALES_SIGNUP', undefined]) {
    const c = setup(row());
    await assert.rejects(() => c.upgrades.provisionEnterpriseUpgrade({ personalWorkspaceId: 'ws1', userId: 'u1',
      option: 'delete', targetPlanKey: 'STANDARD', ...(source ? { source } : {}) }), /MIGRATION_OPTION_UNAVAILABLE/);
    assert.equal(c.s.writes.length, 0);
    assert.equal(c.s.calls.length, 0);
    record({ scenario: 'direct_delete_' + (source || 'default'), result: 'MIGRATION_OPTION_UNAVAILABLE', writes: 0 });
  }
  const historical = setup(row());
  historical.s.bills.push({ id: 'pending_delete', type: 'PLAN_UPGRADE', status: 'PENDING', userId: 'u1', metadata: { option: 'delete' } });
  await assert.rejects(() => historical.upgrades.fulfillEnterpriseUpgradeFromOrder('pending_delete'), /MIGRATION_OPTION_UNAVAILABLE/);
  assert.equal(historical.s.writes.length, 0);
  assert.equal(historical.s.bills[0].status, 'PENDING');
  record({ scenario: 'historical_pending_delete', result: 'blocked', orderStatus: 'PENDING', writes: 0 });
  for (const option of ['upgrade', 'retain']) {
    const r = record(await run('paid_only_pending_' + option, row({ key: 'PRO', priceMonthly: 19900, priceYearly: 199000 }), undefined,
      { option, source: 'ADMIN_MANUAL', free: true, paid: true, verifiedPlanConfig: row() }));
    assert.equal(r.response.free, undefined);
    assert.equal(r.bills[0].status, 'PENDING');
    assert.equal(r.bills[0].amount, 19900);
    assert.equal(r.writes.length, 0);
    assert.equal(r.finalWorkspaces[0].type, 'PERSONAL');
  }
  for (const [monthly, yearly] of [[0, 10000], [5000, 0]]) for (const billingCycle of ['MONTH', 'YEAR']) {
    const r = record(await run('mixed_' + monthly + '_' + billingCycle, row({ priceMonthly: monthly, priceYearly: yearly }), undefined, { billingCycle }));
    assert.equal(r.status, 400);
    assert.equal(r.bills.length, 0);
    assert.equal(r.writes.length, 0);
  }
  const zeroPro = record(await run('zero_PRO', row({ key: 'PRO' })));
  assert.equal(zeroPro.status, 400);
  assert.equal(zeroPro.bills.length, 0);

  const uiResults = [];
  for (const [file, name] of [
    ['src/app/workspace/upgrade/page.tsx', 'handleSubmit'],
    ['src/components/studio/UpgradeModal.tsx', 'handleUpgrade'],
    ['src/components/workspace-hub/modals/UpgradeModal.tsx', 'handleUpgrade'],
  ]) for (const [scenario, payload, options] of [
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
    if (scenario === 'checkout') {
      assert.equal(r.redirect, '/isolated-checkout');
      assert.equal(r.completedCallbacks, 0);
      assert.equal(r.storageWrites.length, 0);
    } else if (scenario === 'free_complete') {
      if (name === 'handleSubmit') assert.ok(r.storageWrites.some(([k, v]) => k === 'personalWorkspaceUpgraded' && v === 'true'));
      else assert.equal(r.completedCallbacks, 1);
    } else {
      assert.equal(r.redirect, '');
      assert.equal(r.completedCallbacks, 0);
      assert.equal(r.storageWrites.some(([k, v]) => k === 'personalWorkspaceUpgraded' && v === 'true'), false);
    }
    uiResults.push(r);
  }
  for (const file of ['src/app/api/__tests__/r0a4-combo-regression.test.ts', 'docs/reviews/R0-A5-fix-report.md']) read(file);
  const data = { capturedAt: new Date().toISOString(), controls, uiResults,
    isolation: 'Actual route/plan/provision/private write logic and actual extracted TSX handlers, with production response protocol. Persistence/auth/payment/trial IO are stubs. No real DB, grants, payment, model or network calls.',
    limits: '42 backend scenarios and 27 handler scenarios are memory/logic evidence, not MySQL concurrency, actual billing, browser DOM, deployed configuration or production readiness. Changes injected before second plan read; post-confirmation DB linearizability not claimed.', sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ backendScenarios: controls.length, actualUIHandlerScenarios: uiResults.length, status: 'all asserted behavior passed' }));
})().catch(e => { console.error(e); process.exitCode = 1; });
