// Independent audit: actual business modules, closed dependency list, memory-only persistence and IO.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-B-independent-review';
const hashes = {};
function read(file) {
  const source = fs.readFileSync(file, 'utf8');
  hashes[file] = crypto.createHash('sha256').update(source).digest('hex');
  return source;
}
function load(file, stubs) {
  const js = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Error, Date, Response, Headers, process: { env: {} },
    console: { error() {}, warn() {}, log() {} },
    require(name) { if (Object.hasOwn(stubs, name)) return stubs[name]; throw new Error('Unstubbed dependency: ' + name); },
  }, { filename: file });
  return exports;
}
const clone = value => structuredClone(value);
function setup(options = {}) {
  const planExpiry = new Date(Date.now() + 30 * 86400000);
  const order = { id: 'SA_fixture', type: 'SEAT_ADDON', status: 'PENDING', amount: 2600, userId: 'u1', workspaceId: 'w1',
    expiresAt: new Date(Date.now() + 3600000), metadata: { seats: 2, planKey: 'PRO', billingCycle: 'MONTH', expiresAt: planExpiry.toISOString() } };
  const workspace = { id: 'w1', ownerId: 'u1', type: 'ENTERPRISE', status: 'ACTIVE', extraSeats: 0,
    plan: 'PRO', planBillingCycle: 'MONTH', planExpiresAt: planExpiry };
  Object.assign(order, options.order || {});
  Object.assign(workspace, options.workspace || {});
  const s = { orders: { SA_fixture: order }, workspace, writes: [], events: [], depth: 0, reads: 0 };
  let queue = Promise.resolve();
  let injected = false;
  function matches(row, where) {
    return Object.entries(where || {}).every(([k, v]) => {
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('lt' in v) return row[k] < v.lt;
        if ('lte' in v) return row[k] <= v.lte;
        if ('gt' in v) return row[k] > v.gt;
        if ('gte' in v) return row[k] >= v.gte;
      }
      return row[k] === v;
    });
  }
  function apply(row, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) row[key] += value.increment;
      else row[key] = clone(value);
    }
  }
  function model(kind) {
    const log = (table, method) => {
      if (kind === 'ROOT' && s.depth) throw new Error('Root write escaped transaction');
      s.writes.push({ kind, table, method });
    };
    return {
      billingrecord: {
        findUnique: async ({ where }) => {
          s.reads++;
          const result = s.orders[where.id] ? clone(s.orders[where.id]) : null;
          if (options.expiryRace && !injected) {
            injected = true;
            // Represents another request, admitted before cutoff, committing after this read.
            s.orders[where.id].status = 'SUCCESS';
            s.orders[where.id].metadata.seatsAdded = 2;
            s.workspace.extraSeats = 2;
            s.events.push('fixture: another valid in-flight fulfillment commits SUCCESS and 2 seats after stale read');
          }
          return result;
        },
        update: async ({ where, data }) => { log('billingrecord', 'update');
          const row = s.orders[where.id]; if (!row || !matches(row, where)) throw new Error('Record mismatch');
          apply(row, data); return clone(row); },
        updateMany: async ({ where, data }) => { log('billingrecord', 'updateMany');
          const row = s.orders[where.id]; if (!row || !matches(row, where)) return { count: 0 };
          apply(row, data); return { count: 1 }; },
        create: async ({ data }) => { log('billingrecord', 'create'); s.orders[data.id] = clone(data); return clone(data); },
      },
      workspace: {
        findUnique: async ({ where, select }) => {
          if (where.id !== s.workspace.id) return null;
          if (!select) return clone(s.workspace);
          return Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, clone(s.workspace[k])]));
        },
        update: async ({ where, data }) => { log('workspace', 'update');
          if (options.failWorkspace && !injected) { injected = true; throw new Error('INJECTED_WORKSPACE_IO'); }
          if (!matches(s.workspace, where)) throw new Error('Workspace mismatch');
          apply(s.workspace, data); return clone(s.workspace); },
      },
      workspaceplan: { findUnique: async () => ({ key: 'PRO', maxMembers: 5, priceMonthly: 2600 }) },
    };
  }
  const prisma = { ...model('ROOT'), $transaction: fn => {
    const run = async () => {
      if (options.changeAtTransaction && !injected) {
        injected = true;
        Object.assign(s.workspace, options.changeAtTransaction);
        s.events.push('fixture: space changed after pre-read and before transaction');
      }
      const beforeOrders = clone(s.orders), beforeWorkspace = clone(s.workspace);
      s.depth++;
      try {
        const result = await fn(model('TX'));
        if (options.failCommit && !injected) { injected = true; throw new Error('INJECTED_COMMIT_IO'); }
        return result;
      } catch (e) { s.orders = beforeOrders; s.workspace = beforeWorkspace; throw e; }
      finally { s.depth--; }
    };
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  } };
  const expiry = load('src/lib/order-expiry.ts', { '@/lib/prisma': { prisma } });
  const seat = load('src/lib/payment/seat-addon-fulfill.ts', { '@/lib/prisma': { prisma }, '@/lib/order-expiry': expiry });
  const credit = { grantPoints: async () => { throw new Error('Unexpected grant'); }, getBalanceSummary: async () => ({}) };
  const fulfill = load('src/lib/payment/fulfill.ts', { '@/lib/prisma': { prisma }, '@/lib/order-expiry': expiry,
    '@/lib/payment/seat-addon-fulfill': seat, '@/lib/credit-service': credit });
  const mock = load('src/app/api/payments/mock/confirm/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/prisma': { prisma }, '@/lib/order-expiry': expiry, '@/lib/payment/seat-addon-fulfill': seat,
    '@/lib/auth': { validateUser: async () => ({ valid: true, user: { id: 'u1' } }) },
    '@/lib/credit-service': credit, '@/lib/payment-gateway': { resolvePaymentMode: () => 'MOCK' },
    '@/lib/workspace-upgrade-service': { fulfillEnterpriseUpgradeFromOrder: async () => { throw new Error('Unexpected upgrade'); } },
  });
  const input = { orderNo: 'SA_fixture', paymentMode: 'REAL', isRealPayment: true, paymentMethod: 'WECHAT_PAY', remark: 'isolated', gatewayAmountCents: 2600 };
  return { s, seat, fulfill, mock, input, prisma, expiry };
}
const request = () => ({ headers: new Headers({ authorization: 'Bearer isolated' }), json: async () => ({ orderNo: 'SA_fixture' }) });
function outcome(name, c, result) { return { scenario: name, result, orderStatus: c.s.orders.SA_fixture.status,
  extraSeats: c.s.workspace.extraSeats, workspaceStatus: c.s.workspace.status, workspaceType: c.s.workspace.type,
  workspacePlan: c.s.workspace.plan, workspaceBillingCycle: c.s.workspace.planBillingCycle,
  writes: c.s.writes, events: c.s.events }; }
async function cashierInitialState(status) {
  const file = 'src/app/user/pay/mock/page.tsx';
  const source = read(file), tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (!callback && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect') callback = node.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(callback);
  const state = { requestedStatus: status, result: null, error: null };
  const context = { orderNo: 'SA_fixture',
    authFetch: async () => ({ success: true, data: { status, type: 'SEAT_ADDON', seats: 2 } }),
    setOrder() {}, setResult: value => { state.result = value; }, setError: value => { state.error = value; }, setModeBlocked() {}, setLoading() {},
  };
  const js = ts.transpileModule('(' + callback.getText(tree) + ')', { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(js, context)();
  await new Promise(resolve => setTimeout(resolve, 0));
  return state;
}
function qrText() {
  let stateIndex = 0;
  const values = [{ orderNo: 'SA_fixture', type: 'SEAT_ADDON', seats: 2, status: 'SUCCESS', amountCents: 2600, title: '席位订单' }, false, null, null];
  const jsx = (type, props) => ({ type, props });
  const mod = load('src/app/user/pay/qr/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: { useState: () => [values[stateIndex++], () => {}], useCallback: fn => fn, useEffect() {}, useRef: () => ({ current: null }) },
    'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => ({ get: () => 'SA_fixture' }) },
    qrcode: { toDataURL: async () => { throw new Error('Unexpected QR generation'); } },
    'lucide-react': { AlertTriangle: 'Alert', CheckCircle2: 'Check', CreditCard: 'Card', Loader2: 'Loader' },
    '@/utils/auth': { getAuthToken: () => 'isolated' },
  });
  const strings = [];
  function walk(node) {
    if (typeof node === 'string') strings.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node?.props) walk(node.props.children);
  }
  walk(mod.default());
  return strings;
}
(async () => {
  const controls = [];
  const concurrent = setup();
  const results = await Promise.all([concurrent.seat.fulfillSeatAddonOrder(concurrent.input), concurrent.seat.fulfillSeatAddonOrder(concurrent.input)]);
  assert.equal(concurrent.s.workspace.extraSeats, 2);
  assert.equal(results.filter(r => r.status === 'FULFILLED').length, 1);
  controls.push(outcome('same_order_concurrency_fixed', concurrent, results));
  for (const option of ['failWorkspace', 'failCommit']) {
    const c = setup({ [option]: true });
    const r = await c.seat.fulfillSeatAddonOrder(c.input);
    assert.equal(r.ok, false); assert.equal(c.s.workspace.extraSeats, 0); assert.equal(c.s.orders.SA_fixture.status, 'PENDING');
    controls.push(outcome(option + '_rolls_back', c, r));
  }
  const observations = [];
  for (const path of ['shared', 'real_wrapper', 'mock_route']) {
    const c = setup({ expiryRace: true, order: { expiresAt: new Date(Date.now() - 1000) } });
    let result;
    if (path === 'shared') result = await c.seat.fulfillSeatAddonOrder(c.input);
    if (path === 'real_wrapper') result = await c.fulfill.fulfillPaidOrder(c.input);
    if (path === 'mock_route') { const res = await c.mock.POST(request()); result = { status: res.status, body: await res.json() }; }
    assert.equal(c.s.orders.SA_fixture.status, 'EXPIRED'); assert.equal(c.s.workspace.extraSeats, 2);
    observations.push(outcome('stale_expiry_overwrites_SUCCESS_' + path, c, result));
  }
  for (const status of ['ARCHIVED', 'DISABLED']) {
    const c = setup({ workspace: { status } });
    const result = await c.seat.fulfillSeatAddonOrder(c.input);
    assert.equal(result.status, 'FULFILLED'); assert.equal(c.s.workspace.extraSeats, 2);
    observations.push(outcome('read_only_space_accepted_' + status, c, result));
  }
  for (const change of [{ type: 'PERSONAL' }, { planExpiresAt: new Date(Date.now() + 60 * 86400000) }]) {
    const c = setup({ changeAtTransaction: change });
    const result = await c.seat.fulfillSeatAddonOrder(c.input);
    assert.equal(result.status, 'FULFILLED'); assert.equal(c.s.workspace.extraSeats, 2);
    observations.push(outcome('workspace_changed_after_precheck_' + Object.keys(change)[0], c, result));
  }
  const missingExpiry = setup();
  delete missingExpiry.s.orders.SA_fixture.metadata.expiresAt;
  const missingResult = await missingExpiry.seat.fulfillSeatAddonOrder(missingExpiry.input);
  assert.equal(missingResult.status, 'FULFILLED');
  observations.push(outcome('missing_quote_expiry_accepted', missingExpiry, missingResult));
  for (const change of [{ plan: 'ENTERPRISE' }, { planBillingCycle: 'YEAR' }]) {
    const c = setup({ workspace: change });
    const result = await c.seat.fulfillSeatAddonOrder(c.input);
    assert.equal(result.status, 'FULFILLED');
    observations.push(outcome('quote_plan_or_cycle_changed_' + Object.keys(change)[0], c, result));
  }
  const carrierFixture = setup();
  const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
  const auth = { validateUser: async () => ({ valid: true, user: { id: 'u1' } }) };
  const expectedCodeUrl = 'weixin://fixture-only-no-payment';
  const addon = load('src/app/api/workspace/seat-addon/route.ts', {
    'next/server': next, crypto, '@/lib/prisma': { prisma: carrierFixture.prisma }, '@/lib/auth': auth,
    '@/lib/workspace-readonly-guard': { assertWorkspaceWritable: async () => {} }, '@/lib/order-expiry': carrierFixture.expiry,
    '@/lib/payment-gateway': { resolvePaymentMode: () => 'REAL', createCharge: async p => ({ mode: 'REAL',
      payUrl: '/user/pay/qr?orderNo=' + p.orderNo, gatewayPayload: { codeUrl: expectedCodeUrl } }) },
  });
  const created = await addon.POST({ headers: new Headers(), json: async () => ({ workspaceId: 'w1', seats: 2 }) });
  assert.equal(created.status, 200);
  const createdBody = await created.json();
  const query = load('src/app/api/payments/order/route.ts', { 'next/server': next, '@/lib/prisma': { prisma: carrierFixture.prisma }, '@/lib/auth': auth });
  const queried = await query.GET({ headers: new Headers(), nextUrl: new URL('http://isolated/api/payments/order?orderNo=' + createdBody.orderNo) });
  const queriedBody = await queried.json();
  assert.equal(queriedBody.data.codeUrl, null);
  const carrier = { scenario: 'seat_order_drops_gateway_QR_carrier', chargeResultCodeUrl: expectedCodeUrl,
    createResponse: createdBody, storedCodeUrl: carrierFixture.s.orders[createdBody.orderNo].metadata.codeUrl ?? null, queriedCodeUrl: queriedBody.data.codeUrl };
  const ui = [];
  for (const status of ['PENDING', 'SUCCESS', 'EXPIRED', 'FAILED', 'REFUNDED']) ui.push(await cashierInitialState(status));
  assert.ok(ui.filter(r => ['EXPIRED', 'FAILED', 'REFUNDED'].includes(r.requestedStatus)).every(r => r.result?.includes('已完成支付并入账')));
  const qr = qrText(); assert.ok(qr.includes('支付成功，算力已到账'));
  for (const file of ['src/app/api/__tests__/r0b-seat-addon.test.ts', 'docs/reviews/R0-B-fix-report.md', 'src/lib/workspace-readonly-guard.ts', 'src/lib/payment-gateway.ts']) read(file);
  const evidence = { capturedAt: new Date().toISOString(), controls, observations, gatewayCarrier: carrier, mockCashierActualEffect: ui, realQrActualComponentText: qr,
    isolation: 'Actual shared seat service, real wrapper, mock route, actual order-expiry helper, actual extracted UI effect and QR component with hook/jsx stubs. All DB/auth/payment/network/React rendering IO are local stubs. No real money, seats or models.',
    limits: 'Stale expiry fixture simulates another already-admitted transaction completing between read and expiry update; does not prove actual MySQL schedule or production occurrence. Transaction model tests logic and rollback only. UI effects/component invocation is not browser DOM validation.', sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ controls: controls.length, backendCounterexamples: observations.map(r => ({ scenario: r.scenario, orderStatus: r.orderStatus, extraSeats: r.extraSeats })),
    cashier: ui, gatewayCarrier: carrier, realQrSeatOrderMessage: qr.find(t => t.includes('支付成功')) }, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; });
