// Offline evidence only. No real database, network, model, mail, SMS or payment calls.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ts = require('typescript');
const out = 'docs/product-business-review-2026-11-05';
const hashed = new Set();
const source = file => { hashed.add(file); return fs.readFileSync(file, 'utf8'); };
function load(file, stubs = {}, env = {}) {
  const js = ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, crypto, console, Date, Map, Set, JSON, Headers, Response,
    process: { cwd: () => process.cwd(), env: { NODE_ENV: 'test', ...env } },
    require: name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name === 'crypto') return crypto;
      throw new Error('Unstubbed dependency: ' + name);
    },
  }, { filename: file });
  return exports;
}
const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
const request = body => ({ headers: new Headers(), json: async () => body });
function makeLedgerState() {
  const state = { balance: 0n, wallet: 0n, grants: [], ledgers: [], bills: [], orders: [], membership: 'FREE' };
  const quota = () => ({ id: 'q1', workspaceId: 'ws1', tokenBalance: state.balance, storageLimit: 0n, apiCallsLimit: 0n });
  const tx = {
    user: { findUnique: async () => ({ membershipLevel: state.membership }), update: async ({ data }) => { state.membership = data.membershipLevel; } },
    workspace: { findMany: async () => [{ id: 'ws1' }], findUnique: async () => ({ id: 'ws1', name: 'Mock enterprise', type: 'ENTERPRISE' }) },
    workspacequota: {
      findUnique: async () => quota(), findMany: async () => [quota()],
      update: async ({ data }) => {
        if (typeof data.tokenBalance === 'bigint') state.balance = data.tokenBalance;
        if (data.tokenBalance?.increment !== undefined) state.balance += data.tokenBalance.increment;
        if (data.tokenBalance?.decrement !== undefined) state.balance -= data.tokenBalance.decrement;
        return quota();
      },
    },
    userwallet: { upsert: async ({ create, update }) => { state.wallet = state.wallet === 0n ? create.balance : state.wallet + update.balance.increment; return { balance: state.wallet }; } },
    pointgrant: { create: async ({ data }) => { state.grants.push(data); return data; } },
    pointledger: { findFirst: async () => null, create: async ({ data }) => { state.ledgers.push(data); return data; } },
    membershiporder: { create: async ({ data }) => { state.orders.push(data); return data; } },
    membershipchangelog: { create: async () => ({}) },
    billingrecord: { create: async ({ data }) => { state.bills.push(data); return data; } },
    operationlog: { create: async () => ({}) },
  };
  const prisma = { ...tx, $transaction: async fn => fn(tx) };
  const credit = load('src/lib/credit-service.ts', {
    '@/lib/prisma': { prisma }, '@prisma/client': { Prisma: {} },
    '@/lib/notifications-store': {},
    '@/lib/workspace-readonly-guard': { assertWorkspaceWritable: async () => {} },
    '@/lib/register-gift-config': {}, '@/lib/points-notifications': {},
  });
  return { state, tx, prisma, credit };
}
(async () => {
  const results = [];
  const { state, prisma, credit } = makeLedgerState();
  prisma.membershiplevel = { findMany: async () => [
    { id: 'FREE', name: 'FREE', nameZh: 'Free', sortOrder: 0 },
    { id: 'PAID', name: 'PAID', nameZh: 'Paid', sortOrder: 1, priceMonthly: 1000, priceYearly: 10000, tokenLimit: 100n, maxStorage: 1000n, maxApiCalls: 1000n },
  ] };
  const membership = load('src/app/api/membership/upgrade/route.ts', {
    'next/server': next, '@/lib/prisma': { prisma },
    '@/lib/auth': { validateUser: async () => ({ valid: true, user: { id: 'user1', role: 'user' } }) },
    '@/lib/quota-cycle': { getNextMonthResetDate: () => new Date('2030-01-01') },
    '@/lib/quota-token': { UNLIMITED_TOKEN: -1n, isUnlimitedTokenLimit: value => value === -1n },
    '@/lib/limit-utils': { mergeLimits: (a, b) => Math.max(Number(a), Number(b)) },
    '@/lib/credit-service': credit,
  });
  const response = await membership.POST(request({ targetLevel: 'PAID', billingCycle: 'MONTH' }));
  assert.equal(response.status, 200);
  assert.equal(state.membership, 'PAID');
  assert.equal(state.balance, 200n);
  assert.equal(state.grants.reduce((s, g) => s + g.remaining, 0n), 100n);
  results.push({ case: 'membership_upgrade_without_payment_and_double_balance', status: response.status, resultingMembership: state.membership, paymentGatewayDependencies: 0, successfulBillingRecords: state.bills.filter(b => b.status === 'SUCCESS').length, quotaBalance: String(state.balance), grantRemaining: '100', explanation: 'Real route and real grantPoints; persistence and authentication are isolated stubs. Target quota is 100, actual snapshot becomes 200.' });

  let seats = 0, reads = 0, releaseReads;
  const gate = new Promise(resolve => { releaseReads = resolve; });
  const order = { id: 'seat-order', status: 'PENDING', type: 'SEAT_ADDON', amount: 100, workspaceId: 'ws1', metadata: { seats: 2 } };
  const billingrecord = {
    findUnique: async () => { const snapshot = { ...order }; if (++reads === 2) releaseReads(); await gate; return snapshot; },
    update: async ({ data }) => { Object.assign(order, data); return order; },
  };
  let serial = Promise.resolve();
  const seatPrisma = { billingrecord, $transaction: fn => {
    const running = serial.then(() => fn({ workspace: { update: async ({ data }) => { seats += data.extraSeats.increment; } } }));
    serial = running.catch(() => {}); return running;
  } };
  const fulfill = load('src/lib/payment/fulfill.ts', { '@/lib/prisma': { prisma: seatPrisma }, '@/lib/credit-service': {}, '@/lib/order-expiry': { isOrderExpired: () => false } });
  const input = { orderNo: order.id, paymentMethod: 'MOCK', paymentMode: 'MOCK', remark: 'isolated test', gatewayAmountCents: 100 };
  const fulfilled = await Promise.all([fulfill.fulfillPaidOrder(input), fulfill.fulfillPaidOrder(input)]);
  assert.equal(seats, 4);
  results.push({ case: 'two_concurrent_seat_notifications', purchasedSeats: 2, grantedSeats: seats, results: fulfilled.map(x => x.status), explanation: 'Both callbacks read PENDING before serialized transactions; real fulfillment function increments twice. This is a controlled interleaving, not a live DB concurrency test.' });

  const recycleState = makeLedgerState();
  recycleState.state.balance = 100n;
  recycleState.state.grants.push({ id: 'original', scope: 'WORKSPACE', remaining: 100n });
  await recycleState.credit.recycleEnterprisePool({ workspaceId: 'ws1', userId: 'owner1', points: 100 });
  assert.equal(recycleState.state.balance, 0n);
  assert.equal(recycleState.state.grants[0].remaining, 100n);
  results.push({ case: 'enterprise_recycle_source_grant_not_reduced', poolSnapshot: String(recycleState.state.balance), walletSnapshot: String(recycleState.state.wallet), originalWorkspaceGrantRemaining: String(recycleState.state.grants[0].remaining), allGrantRemaining: String(recycleState.state.grants.reduce((s, g) => s + g.remaining, 0n)), explanation: 'Real recycle function creates destination grant but does not reduce source grants. Does not prove the extra amount can be spent through every execution path.' });

  const gateway = load('src/lib/payment-gateway.ts', {}, { NODE_ENV: 'production', PAYMENT_MODE: 'mock' });
  assert.equal(gateway.resolvePaymentMode(), 'MOCK');
  results.push({ case: 'explicit_mock_mode_in_production', resolvedMode: gateway.resolvePaymentMode(), explanation: 'Conditional configuration exposure; no claim that production currently uses this setting.' });

  const pricing = load('src/lib/billing/pricing-center.ts', { '@/lib/prisma': {}, '@/lib/model-registry': {}, './billing-config': {} });
  const multiplier = pricing.effectiveMultiplierBps({ priceKind: 'BYOK_OFFICIAL', markupCoefficientBps: 2000, byokServiceRateBps: 1500 });
  assert.equal(multiplier.multiplierBps, 11500);
  results.push({ case: 'byok_multiplier', serviceRateBps: 1500, appliedMultiplierBps: multiplier.multiplierBps, explanation: 'Formula applies 115% of registered model base price, not only 15%; charging policy and active paths still need approval/verification.' });

  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
  const terms = /grantPoints|grantNewSpaceTrialQuota|grantNewUserGift|fulfillPaidOrder|createCharge|extraSeats|recycleEnterprisePool|refundConsumedPoints|consumePoints|createModelAdapter|testDeploymentConnection|testProviderConnection|sendMail|storeSmsCode|upgradePersonalToEnterprise|provisionEnterpriseUpgrade/;
  const inventory = [];
  for (const file of walk('src/app/api').filter(p => p.endsWith('.ts') && !p.includes('__tests__') && !p.endsWith('.test.ts'))) {
    const s = source(file);
    const hits = s.split('\n').flatMap((line, i) => !line.trim().startsWith('//') && terms.test(line) ? [{ line: i + 1, text: line.trim() }] : []);
    if (hits.length) inventory.push({ file, hits });
  }
  for (const file of [...walk('src/lib').filter(p => p.endsWith('.ts') && !p.includes('__tests__') && !p.endsWith('.test.ts')), 'prisma/schema.prisma', 'src/middleware.ts', 'src/components/HeroSection.tsx', 'src/components/CTA.tsx', 'src/app/pricing/page.tsx', 'src/app/workspace-hub/page.tsx', 'src/app/auth/register/page.tsx', 'src/app/auth/login/page.tsx', 'src/app/studio/page.tsx']) source(file);
  fs.writeFileSync(out + '/verification.json', JSON.stringify({ capturedAt: new Date().toISOString(), kind: 'offline isolated source reproduction; no production or external calls', cases: results }, null, 2));
  fs.writeFileSync(out + '/source-evidence.json', JSON.stringify({ capturedAt: new Date().toISOString(), costAndEntitlementSymbolInventory: inventory, caveat: 'Symbol inventory includes imports/helpers and is not exhaustive control-flow proof. Non-symbol cost sources need manual audit.', sha256: Object.fromEntries([...hashed].sort().map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])) }, null, 2));
  console.log(JSON.stringify({ casesPassed: results.length, cases: results, entryFilesWithCostOrEntitlementSymbols: inventory.length, filesHashed: hashed.size }));
})().catch(error => { console.error(error); process.exitCode = 1; });
