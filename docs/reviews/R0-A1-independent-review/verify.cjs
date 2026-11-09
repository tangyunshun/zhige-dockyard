// Offline source audit. Actual route + plan reader + provisioning service; all persistence and external IO are stubs.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const dir = 'docs/reviews/R0-A1-independent-review';
const seen = new Set();
function load(file, stubs = {}) {
  seen.add(file);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, crypto, Response, Headers, console, Date, JSON,
    require: name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name === 'crypto') return crypto;
      throw new Error('Unstubbed dependency: ' + name);
    },
  }, { filename: file });
  return exports;
}
const constants = load('src/constants/workspace-plans.ts');
const limits = load('src/lib/limit-utils.ts');
const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
function row(key, changes = {}) {
  return { key, name: key, description: '', isActive: true, purchasable: true, priceMonthly: 0, priceYearly: 0,
    maxMembers: 2, maxComponents: 2, maxStorage: 100, maxApiCalls: 100, sortOrder: 20,
    trialGift: { enabled: false, points: 0, expireDays: 0 }, ...changes };
}
function setup(rows) {
  const state = { workspace: { id: 'ws1', ownerId: 'u1', name: 'Personal', type: 'PERSONAL', plan: 'STANDARD', workspacequotaId: 'q1' }, writes: [], calls: [], bills: [] };
  const quota = { id: 'q1', workspaceId: 'ws1', membershipLevelId: 'FREE', tokenBalance: 0n };
  const level = { id: 'FREE', maxEnterpriseWorkspaces: 2, maxStorage: 0n, maxApiCalls: 0n, tokenLimit: 0n };
  const prisma = {
    workspaceplan: {
      findUnique: async ({ where }) => rows.find(r => r.key === where.key) || null,
      findMany: async ({ where }) => rows.filter(r => !where?.isActive || r.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    },
    workspace: {
      findUnique: async () => ({ ...state.workspace }), findMany: async () => [],
      update: async ({ data }) => { state.writes.push({ table: 'workspace', data }); Object.assign(state.workspace, data); return { ...state.workspace }; },
    },
    user: { findUnique: async () => ({ id: 'u1', name: 'User', membershipLevel: 'FREE', role: 'user' }) },
    membershiplevel: { findUnique: async () => level, findFirst: async () => level },
    platformdefaultmodel: { findMany: async () => [] },
    workspacequota: { findUnique: async () => quota, update: async ({ data }) => { state.writes.push({ table: 'workspacequota', data }); return { ...quota, ...data }; } },
    workspace_model_policy: { findUnique: async () => ({ id: 'policy' }) },
    operationlog: { create: async () => ({}) },
    billingrecord: { create: async ({ data }) => { state.bills.push(data); return data; } },
  };
  prisma.$transaction = async fn => fn(prisma);
  const planService = load('src/lib/workspace-plan-service.ts', { '@/lib/prisma': { prisma }, '@/constants/workspace-plans': constants });
  const naming = { generateEnterpriseWorkspaceName: async () => 'Mock enterprise' };
  const upgradeService = load('src/lib/workspace-upgrade-service.ts', {
    '@/lib/prisma': { prisma }, '@/lib/workspace-naming': naming, '@/lib/workspace-plan-service': planService,
    '@/lib/new-space-trial-quota': { grantNewSpaceTrialQuota: async () => { state.calls.push('trial'); return { granted: 0 }; } },
    '@/lib/personal-gift-migration': { migratePersonalGiftToEnterprisePool: async () => { throw new Error('Unexpected migration'); } },
    '@/constants/workspace-plans': constants, '@/lib/limit-utils': limits,
  });
  const route = load('src/app/api/workspace/upgrade/route.ts', {
    'next/server': next, '@/lib/prisma': { prisma }, '@/lib/workspace-plan-service': planService,
    '@/lib/auth': { validateUser: async () => ({ valid: true, user: { id: 'u1', role: 'user' } }), isAdminRole: () => false },
    '@/lib/workspace-readonly-guard': { assertWorkspaceWritable: async () => {} },
    '@/lib/payment-gateway': { resolvePaymentMode: () => 'MOCK', createCharge: async data => { state.calls.push({ type: 'charge', amount: data.amountCents }); return { mode: 'MOCK', payUrl: 'stub-only' }; } },
    '@/constants/workspace-plans': constants, '@/lib/order-expiry': { newOrderExpiry: () => new Date(Date.now() + 60000) },
    '@/lib/workspace-upgrade-service': upgradeService,
  });
  return { state, route };
}
async function run(name, rows, body) {
  const c = setup(rows);
  const response = await c.route.POST({ headers: new Headers({ authorization: 'Bearer isolated.stub' }), json: async () => ({ workspaceId: 'ws1', option: 'upgrade', billingCycle: 'MONTH', ...body }) });
  return { scenario: name, httpStatus: response.status, response: await response.json(), finalType: c.state.workspace.type, finalPlan: c.state.workspace.plan,
    businessWrites: c.state.writes.length, bills: c.state.bills.map(b => ({ status: b.status, amount: b.amount, target: b.metadata?.toPlan || b.metadata?.targetPlan })), calls: c.state.calls };
}
(async () => {
  const results = [];
  const omitted = await run('omitted_target_checks_STANDARD_but_provisions_paid_PRO', [row('STANDARD'), row('PRO', { priceMonthly: 19900, priceYearly: 199000, sortOrder: 10, maxMembers: 100 })], {});
  assert.equal(omitted.httpStatus, 200);
  assert.equal(omitted.response.free, true);
  assert.equal(omitted.finalPlan, 'PRO');
  assert.equal(omitted.bills[0].status, 'SUCCESS');
  assert.equal(omitted.bills[0].amount, 19900);
  assert.equal(omitted.calls.length, 0);
  results.push(omitted);

  const inactive = await run('inactive_STANDARD_still_provisioned', [row('STANDARD', { isActive: false })], { targetPlan: 'STANDARD' });
  assert.equal(inactive.httpStatus, 200);
  assert.equal(inactive.finalType, 'ENTERPRISE');
  results.push(inactive);

  const missingPrices = await run('null_prices_coerced_to_zero_before_validation', [row('STANDARD', { priceMonthly: null, priceYearly: null })], { targetPlan: 'STANDARD' });
  assert.equal(missingPrices.httpStatus, 200);
  assert.equal(missingPrices.response.free, true);
  results.push(missingPrices);

  const mixedPrices = await run('base_plan_free_month_paid_year_still_free', [row('STANDARD', { priceMonthly: 0, priceYearly: 10000 })], { targetPlan: 'STANDARD' });
  assert.equal(mixedPrices.httpStatus, 200);
  assert.equal(mixedPrices.response.free, true);
  results.push(mixedPrices);

  const zeroPro = await run('unapproved_zero_PRO_creates_zero_amount_checkout', [row('PRO')], { targetPlan: 'PRO' });
  assert.equal(zeroPro.httpStatus, 200);
  assert.equal(zeroPro.bills[0].amount, 0);
  assert.equal(zeroPro.bills[0].status, 'PENDING');
  assert.ok(zeroPro.calls.some(x => x.type === 'charge' && x.amount === 0));
  results.push(zeroPro);

  const data = { capturedAt: new Date().toISOString(), kind: 'real current route, strict reader and provisioning functions; stub-only persistence/auth/payment; no live database, model or payment calls', results,
    limits: 'In-memory stubs do not prove production incidence or MySQL constraints; null DB Int fields require malformed/partial input evidence, while disabled, mixed-price and omitted-target scenarios use ordinary schema-compatible values.',
    sha256: Object.fromEntries([...seen].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])) };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify({ observedScenarios: results.length, results }));
})().catch(error => { console.error(error); process.exitCode = 1; });
