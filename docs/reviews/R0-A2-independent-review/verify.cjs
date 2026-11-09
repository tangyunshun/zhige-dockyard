// Independent offline audit: execute actual source, replace every persistence/external IO boundary.
// Historical counterexample evidence, not the post-fix regression suite.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const dir = 'docs/reviews/R0-A2-independent-review';
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
function setup(first, later = first) {
  const initial = { id: 'ws1', ownerId: 'u1', name: 'Personal', type: 'PERSONAL', plan: 'FREE', workspacequotaId: 'q1' };
  const s = { workspaces: { ws1: initial }, writes: [], calls: [], bills: [], reads: 0 };
  const quota = { id: 'q1', workspaceId: 'ws1', membershipLevelId: 'FREE', tokenBalance: 0n };
  const level = { id: 'FREE', maxEnterpriseWorkspaces: 2, maxStorage: 0n, maxApiCalls: 0n, tokenLimit: 0n };
  function write(table, method, args) { s.writes.push({ table, method, data: args.data, where: args.where }); }
  const prisma = {
    workspaceplan: { findUnique: async ({ where }) => {
      const current = ++s.reads === 1 ? first : later;
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
    workspacequota: { findUnique: async () => quota,
      update: async args => { write('workspacequota', 'update', args); return { ...quota, ...args.data }; } },
    workspace_model_policy: { findUnique: async () => ({ id: 'policy' }) },
    operationlog: { create: async args => { write('operationlog', 'create', args); return args.data; } },
    billingrecord: { create: async ({ data }) => { s.bills.push(data); return data; } },
  };
  prisma.$transaction = async fn => {
    if (typeof fn !== 'function') throw new Error('Unexpected asset migration');
    return fn(prisma);
  };
  const planService = load('src/lib/workspace-plan-service.ts', { '@/lib/prisma': { prisma }, '@/constants/workspace-plans': constants });
  const upgrades = load('src/lib/workspace-upgrade-service.ts', {
    '@/lib/prisma': { prisma }, '@/lib/workspace-plan-service': planService,
    '@/lib/workspace-naming': { generateEnterpriseWorkspaceName: async () => 'Fixture enterprise' },
    '@/lib/new-space-trial-quota': { grantNewSpaceTrialQuota: async () => { s.calls.push({ kind: 'trial' }); return { granted: 0 }; } },
    '@/lib/personal-gift-migration': { migratePersonalGiftToEnterprisePool: async () => { throw new Error('Unexpected gift migration'); } },
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
async function run(name, first, later = first, body = {}) {
  const { s, route } = setup(first, later);
  const response = await route.POST({ headers: new Headers({ authorization: 'Bearer isolated' }),
    json: async () => ({ workspaceId: 'ws1', option: 'upgrade', billingCycle: 'MONTH', targetPlan: first?.key || 'STANDARD', ...body }) });
  return { scenario: name, status: response.status, response: await response.json(), planReads: s.reads,
    finalWorkspaces: Object.values(s.workspaces).map(w => ({ type: w.type, plan: w.plan, maxMembers: w.quota?.maxMembers })),
    writes: s.writes.map(w => ({ table: w.table, method: w.method })),
    bills: s.bills.map(b => ({ amount: b.amount, status: b.status })), calls: s.calls };
}
async function ui(file, handlerName, payload) {
  const source = read(file);
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === handlerName) initializer = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(initializer, 'handler must exist');
  const result = { file, payload, success: [], errors: [], storageWrites: [], completedCallbacks: 0, closed: 0, navigations: [] };
  const context = {
    setLoading() {}, selectedOption: 'upgrade', option: 'upgrade', personalWorkspace: { id: 'ws1' },
    quota: { enterpriseCount: 0, maxEnterprise: 2 }, workspaceId: 'ws1', targetPlan: 'STANDARD', billingCycle: 'MONTH',
    getAuthToken: () => 'isolated',
    localStorage: { getItem: () => 'isolated', setItem: (k, v) => result.storageWrites.push([k, v]), removeItem() {} },
    window: { location: { href: '' } }, router: { push: path => result.navigations.push(path) },
    setTimeout: fn => fn(),
    fetch: async () => ({ ok: true, json: async () => payload }),
    toast: { success: m => result.success.push(m), error: m => result.errors.push(m) },
    onSuccess: () => result.completedCallbacks++, onUpgradeSuccess: () => result.completedCallbacks++, onClose: () => result.closed++,
  };
  const js = ts.transpileModule('(' + initializer.getText(tree) + ')', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const handler = vm.runInNewContext(js, context, { filename: file + ':extracted-handler' });
  await handler();
  result.redirect = context.window.location.href;
  return result;
}
(async () => {
  const good = [];
  good.push(await run('explicit_STANDARD_stable_free', row()));
  assert.equal(good.at(-1).response.free, true);
  assert.equal(good.at(-1).bills[0].amount, 0);
  good.push(await run('missing_target_rejected', row(), row(), { targetPlan: '' }));
  assert.equal(good.at(-1).status, 400);
  good.push(await run('inactive_first_read_rejected', row({ isActive: false })));
  assert.equal(good.at(-1).status, 400);
  good.push(await run('zero_PRO_rejected', row({ key: 'PRO' })));
  assert.equal(good.at(-1).status, 400);
  good.push(await run('paid_PRO_only_PENDING', row({ key: 'PRO', priceMonthly: 19900, priceYearly: 199000 })));
  assert.equal(good.at(-1).bills[0].status, 'PENDING');
  assert.equal(good.at(-1).finalWorkspaces[0].type, 'PERSONAL');

  const counterexamples = [];
  const priceDrift = await run('second_read_STANDARD_becomes_paid_still_free', row(), row({ priceMonthly: 19900, priceYearly: 199000, maxMembers: 99 }));
  assert.equal(priceDrift.response.free, true);
  assert.equal(priceDrift.finalWorkspaces[0].maxMembers, 99);
  assert.deepEqual(priceDrift.bills, [{ amount: 19900, status: 'SUCCESS' }]);
  assert.equal(priceDrift.calls.length, 0);
  counterexamples.push(priceDrift);
  const limitsDrift = await run('second_read_same_free_key_limits_changed_silently', row(), row({ maxMembers: 99 }));
  assert.equal(limitsDrift.finalWorkspaces[0].maxMembers, 99);
  counterexamples.push(limitsDrift);
  for (const option of ['retain', 'delete']) {
    const earlyWrite = await run('second_read_inactive_' + option + '_writes_before_reject', row(), row({ isActive: false }), { option });
    assert.equal(earlyWrite.status, 400, JSON.stringify(earlyWrite));
    assert.ok(earlyWrite.writes.some(w => w.table === 'workspace' && w.method === 'create'));
    assert.ok(earlyWrite.writes.some(w => w.table === 'workspacemember' && w.method === 'create'));
    assert.equal(earlyWrite.bills.length, 0);
    // Cleanup succeeded in this stub; do not claim persistent orphan or migrated assets.
    assert.equal(earlyWrite.finalWorkspaces.length, 1);
    counterexamples.push(earlyWrite);
  }
  const mixed = await run('mixed_zero_positive_BASE_YEAR_creates_order', row({ priceYearly: 10000 }), undefined, { billingCycle: 'YEAR' });
  assert.equal(mixed.status, 200);
  assert.deepEqual(mixed.bills, [{ status: 'PENDING', amount: 10000 }]);
  counterexamples.push(mixed);

  const uiResults = [];
  for (const file of ['src/components/studio/UpgradeModal.tsx', 'src/components/workspace-hub/modals/UpgradeModal.tsx']) {
    const pending = await ui(file, 'handleUpgrade', { success: true, orderNo: 'isolated-pending' });
    assert.equal(pending.completedCallbacks, 1);
    assert.equal(pending.closed, 1);
    uiResults.push(pending);
    const pay = await ui(file, 'handleUpgrade', { success: true, orderNo: 'isolated-pending', payUrl: '/isolated-checkout' });
    assert.equal(pay.completedCallbacks, 0);
    uiResults.push(pay);
    const free = await ui(file, 'handleUpgrade', { success: true, free: true, workspaceId: 'ws1' });
    assert.equal(free.completedCallbacks, 1);
    uiResults.push(free);
  }
  const data = { capturedAt: new Date().toISOString(),
    isolation: 'Actual route/plan reader/provisioning and extracted actual UI handlers; persistence, auth, payment, gift, naming and browser APIs are local stubs. No DB, network, real charges or models.',
    limits: 'In-memory IO does not prove production occurrence or MySQL transaction/concurrency behavior. Price/quota drift models a configuration change between two reads. UI missing-payUrl case is a defensive contract test; the current successful payment gateway supplies a URL. Fixture prices are not business pricing.',
    passingControls: good, counterexamples, uiResults, sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ passingControls: good.length, counterexamples, uiChecks: uiResults.length }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
