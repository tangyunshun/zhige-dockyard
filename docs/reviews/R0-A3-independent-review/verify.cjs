// Independent offline audit: execute actual source, replace every persistence/external IO boundary.
// Historical counterexample evidence, not the post-fix regression suite.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const dir = 'docs/reviews/R0-A3-independent-review';
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
    billingrecord: { create: async ({ data }) => { s.bills.push(data); return data; } },
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
    '@/lib/new-space-trial-quota': { grantNewSpaceTrialQuota: async () => { s.calls.push({ kind: 'trial' }); return { granted: 0 }; } },
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
  return { s, route };
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
(async () => {
  const controls = [];
  for (const option of ['upgrade', 'retain', 'delete']) {
    const result = await run('stable_free_' + option, row(), row(), { option });
    assert.equal(result.status, 200);
    assert.equal(result.response.free, true);
    const enterprise = result.finalWorkspaces.find(w => w.type === 'ENTERPRISE');
    assert.equal(enterprise.plan, 'STANDARD');
    assert.equal(enterprise.maxMembers, 2);
    assert.equal(result.quotas[0].enterpriseSlots, '2');
    assert.equal(result.bills[0].amount, 0);
    if (option === 'delete') {
      assert.equal(result.assets[0].workspaceExists, true);
      assert.equal(result.finalWorkspaces.find(w => w.id === 'ws1').status, 'ARCHIVED');
    }
    controls.push(result);
  }
  for (const [monthly, yearly] of [[0, 10000], [5000, 0]]) {
    for (const billingCycle of ['MONTH', 'YEAR']) {
      const result = await run('mixed_price_rejected_' + monthly + '_' + billingCycle,
        row({ priceMonthly: monthly, priceYearly: yearly }), undefined, { billingCycle });
      assert.equal(result.status, 400);
      assert.equal(result.writes.length, 0);
      assert.equal(result.bills.length, 0);
      assert.equal(result.calls.length, 0);
      controls.push(result);
    }
  }
  for (const option of ['upgrade', 'retain', 'delete']) {
    const rejected = await run('inactive_before_request_' + option, row({ isActive: false }), undefined, { option });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.writes.length, 0);
    controls.push(rejected);
  }
  const forged = await run('client_verified_snapshot_ignored', row({ key: 'PRO', priceMonthly: 19900, priceYearly: 199000 }), undefined,
    { source: 'ADMIN_MANUAL', free: true, paid: true, verifiedPlanConfig: row() });
  assert.equal(forged.response.free, undefined);
  assert.equal(forged.bills[0].status, 'PENDING');
  assert.equal(forged.finalWorkspaces[0].type, 'PERSONAL');
  controls.push(forged);

  const observations = [];
  const changed = await run('live_config_disabled_after_initial_read_still_opens_snapshot', row(), row({ isActive: false, priceMonthly: 19900, priceYearly: 199000, maxMembers: 99 }),
    {}, { changeDuringName: true });
  assert.equal(changed.planReads, 1);
  assert.equal(changed.livePlan.isActive, false);
  assert.equal(changed.status, 200);
  assert.equal(changed.response.free, true);
  assert.equal(changed.bills[0].amount, 0);
  assert.equal(changed.finalWorkspaces[0].maxMembers, 2);
  observations.push(changed);

  const migrationFailure = await run('delete_gift_IO_fails_after_asset_move_cleanup_deletes_destination', row(), row(),
    { option: 'delete' }, { failGift: true });
  assert.equal(migrationFailure.status, 500);
  assert.equal(migrationFailure.finalWorkspaces.length, 1);
  assert.equal(migrationFailure.finalWorkspaces[0].id, 'ws1');
  assert.equal(migrationFailure.assets[0].workspaceExists, false);
  assert.equal(migrationFailure.bills[0].status, 'SUCCESS');
  assert.ok(migrationFailure.writes.some(w => w.table === 'asset' && w.method === 'updateMany'));
  assert.ok(migrationFailure.writes.some(w => w.table === 'workspace' && w.method === 'deleteMany'));
  observations.push(migrationFailure);

  const uiResults = [];
  for (const [file, name] of [
    ['src/components/studio/UpgradeModal.tsx', 'handleUpgrade'],
    ['src/components/workspace-hub/modals/UpgradeModal.tsx', 'handleUpgrade'],
    ['src/app/workspace/upgrade/page.tsx', 'handleSubmit'],
  ]) {
    for (const [scenario, payload, options] of [
      ['checkout', { success: true, orderNo: 'pending', payUrl: '/isolated-checkout' }, {}],
      ['free_complete', { success: true, free: true, workspaceId: 'ws1' }, {}],
      ['pending_without_checkout', { success: true, orderNo: 'pending' }, {}],
      ['business_failure', { success: false, message: 'fixture failure' }, {}],
      ['HTTP_failure', { success: false, message: 'fixture failure' }, { ok: false }],
      ['network_failure', {}, { networkError: true }],
      ['conflicting_failure_free_flag', { success: false, free: true, workspaceId: 'ws1' }, {}],
      ['free_without_workspace', { success: true, free: true }, {}],
    ]) {
      const result = await ui(file, name, payload, options);
      result.scenario = scenario;
      if (scenario === 'checkout') {
        assert.equal(result.redirect, '/isolated-checkout');
        assert.equal(result.completedCallbacks, 0);
        assert.equal(result.storageWrites.length, 0);
      }
      if (scenario === 'pending_without_checkout') {
        assert.equal(result.completedCallbacks, 0);
        assert.equal(result.storageWrites.length, 0);
      }
      if (scenario === 'conflicting_failure_free_flag' && name === 'handleSubmit') {
        assert.ok(result.storageWrites.some(([key, value]) => key === 'personalWorkspaceUpgraded' && value === 'true'));
      }
      uiResults.push(result);
    }
  }
  for (const file of ['prisma/schema.prisma', 'src/app/api/__tests__/r0a3-combo-regression.test.ts',
    'docs/reviews/R0-A3-fix-report.md', 'src/lib/__tests__/refund-integration.test.ts', 'vitest.config.ts']) read(file);
  const data = { capturedAt: new Date().toISOString(),
    isolation: 'Actual business source and extracted UI handlers, closed dependency stubs; no DB/network/model/payment calls. Gift migration IO failure intentionally injected after real asset-move function.',
    limits: 'Memory persistence does not prove actual MySQL incidence/constraints. Asset table has no Prisma workspace relation; actual deployed foreign keys not queried. Snapshot config change simulated at naming IO boundary. UI checks are handler execution, not React DOM/browser tests.',
    controls, observations, uiResults, sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ controls: controls.length, observations, uiChecks: uiResults.length,
    conflictingPageResponse: uiResults.find(r => r.scenario === 'conflicting_failure_free_flag' && r.file.includes('/page.tsx')) }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
