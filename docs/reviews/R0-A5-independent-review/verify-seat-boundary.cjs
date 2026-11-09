// Read-only next-batch diagnosis. Real fulfillment code; every persistence/auth/IO boundary is a stub.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-A5-independent-review';
const hashes = {};
function load(file, stubs) {
  const source = fs.readFileSync(file, 'utf8');
  hashes[file] = crypto.createHash('sha256').update(source).digest('hex');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Error, Response, Headers, console: { error() {}, log() {} },
    require(name) { if (Object.hasOwn(stubs, name)) return stubs[name]; throw new Error('Unstubbed dependency: ' + name); } }, { filename: file });
  return exports;
}
function setup() {
  const state = { order: { id: 'seat_fixture', type: 'SEAT_ADDON', status: 'PENDING', userId: 'u1', workspaceId: 'w1',
    amount: 1000, metadata: { seats: 2 } }, extraSeats: 0, reads: 0, writes: [] };
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let transactions = Promise.resolve();
  const rootBilling = {
    findUnique: async () => {
      const snapshot = structuredClone(state.order);
      if (++state.reads === 2) release();
      await barrier;
      return snapshot;
    },
    update: async ({ data }) => { state.writes.push('ROOT billing.update'); Object.assign(state.order, data); return state.order; },
  };
  const prisma = {
    billingrecord: rootBilling,
    $transaction: async fn => {
      // Serialized transactions intentionally prove a transaction block alone does not fix stale checks.
      const previous = transactions;
      let next;
      transactions = new Promise(resolve => { next = resolve; });
      await previous;
      try { return await fn({
        workspace: { update: async ({ data }) => { state.writes.push('TX workspace.increment'); state.extraSeats += data.extraSeats.increment; return {}; } },
        billingrecord: { update: async ({ data }) => { state.writes.push('TX billing.update'); Object.assign(state.order, data); return state.order; } },
      }); } finally { next(); }
    },
  };
  return { state, prisma };
}
(async () => {
  const real = setup();
  const fulfill = load('src/lib/payment/fulfill.ts', {
    '@/lib/prisma': { prisma: real.prisma }, '@/lib/credit-service': { grantPoints: async () => { throw new Error('Unexpected recharge'); } },
    '@/lib/order-expiry': { isOrderExpired: () => false },
  });
  const input = { orderNo: 'seat_fixture', paymentMethod: 'WECHAT_PAY', paymentMode: 'REAL', remark: 'isolated fixture', gatewayAmountCents: 1000 };
  const realResults = await Promise.all([fulfill.fulfillPaidOrder(input), fulfill.fulfillPaidOrder(input)]);
  assert.equal(real.state.extraSeats, 4);
  assert.equal(realResults.every(r => r.status === 'FULFILLED'), true);
  const after = await fulfill.fulfillPaidOrder(input);
  assert.equal(after.status, 'ALREADY_PROCESSED');
  assert.equal(real.state.extraSeats, 4);

  const mock = setup();
  const route = load('src/app/api/payments/mock/confirm/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/prisma': { prisma: mock.prisma },
    '@/lib/auth': { validateUser: async () => ({ valid: true, user: { id: 'u1' } }) },
    '@/lib/credit-service': { grantPoints: async () => { throw new Error('Unexpected recharge'); }, getBalanceSummary: async () => ({}) },
    '@/lib/payment-gateway': { resolvePaymentMode: () => 'MOCK' }, '@/lib/order-expiry': { isOrderExpired: () => false },
    '@/lib/workspace-upgrade-service': { fulfillEnterpriseUpgradeFromOrder: async () => { throw new Error('Unexpected upgrade'); } },
  });
  const request = () => ({ headers: new Headers({ authorization: 'Bearer isolated' }), json: async () => ({ orderNo: 'seat_fixture' }) });
  const responses = await Promise.all([route.POST(request()), route.POST(request())]);
  assert.equal(mock.state.extraSeats, 4);
  assert.equal(responses.every(r => r.status === 200), true);
  const evidence = {
    capturedAt: new Date().toISOString(),
    isolation: 'Actual fulfillPaidOrder and actual mock POST. Both reads synchronized before serial in-memory transactions; no real DB, signature verification, money or external payment. REAL is a function-input fixture, not an actual paid transaction.',
    expectedSeats: 2,
    realService: { results: realResults, extraSeats: real.state.extraSeats, orderStatus: real.state.order.status, writes: real.state.writes, sequentialRetry: after.status },
    mockRoute: { statusCodes: responses.map(r => r.status), extraSeats: mock.state.extraSeats, orderStatus: mock.state.order.status, writes: mock.state.writes },
    limits: 'Proves stale-read business logic admits duplicate grants even with serialized transaction callbacks. Does not prove production occurrence, actual MySQL locking/deadlocks or live payment configuration.', sha256: hashes,
  };
  fs.writeFileSync(dir + '/NEXT-BATCH-EVIDENCE.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ expectedSeats: 2, realServiceObserved: real.state.extraSeats, mockRouteObserved: mock.state.extraSeats, rootBillingWrites: real.state.writes.filter(s => s.startsWith('ROOT')).length }));
})().catch(e => { console.error(e); process.exitCode = 1; });
