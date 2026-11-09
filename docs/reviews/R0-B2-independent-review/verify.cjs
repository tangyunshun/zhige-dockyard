// Independent, memory-only verification. No real Prisma, provider, env files or network imports.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-B2-independent-review';
const hashes = {};
const clone = value => structuredClone(value);
function read(file) {
  const bytes = fs.readFileSync(file);
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  return bytes.toString('utf8');
}
function load(file, stubs, clock = Date, extra = '') {
  const js = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(js + '\n' + extra, {
    exports, Date: clock, Error, Headers, Response, process: { env: {} },
    console: { error() {}, warn() {}, log() {} },
    require(name) {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      throw new Error('Dependency denied: ' + name);
    },
  }, { filename: file });
  return exports;
}
function setup(options = {}) {
  let instant = Date.UTC(2026, 10, 6, 8);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  }
  const planExpiry = new Date(instant + (options.nearPlanExpiry ? 500 : 30 * 86400000));
  const state = {
    orders: {}, writes: [], tx: 0, events: [], charges: 0,
    workspace: { id: 'w1', ownerId: 'u1', name: 'fixture', type: 'ENTERPRISE', status: 'ACTIVE',
      plan: 'PRO', planBillingCycle: options.cycle === undefined ? 'MONTH' : options.cycle,
      planExpiresAt: planExpiry, extraSeats: 0 },
  };
  state.orders.SA_fixture = { id: 'SA_fixture', userId: 'u1', workspaceId: 'w1', type: 'SEAT_ADDON',
    title: 'fixture', status: 'PENDING', amount: 2600, channel: 'WECHAT_PAY',
    expiresAt: new Date(instant + (options.nearOrderExpiry ? 500 : 3600000)),
    metadata: { seats: 2, planKey: 'PRO', billingCycle: state.workspace.planBillingCycle,
      expiresAt: planExpiry.toISOString() } };
  let injected = false, queue = Promise.resolve();
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'AND') return value.every(w => matches(row, w));
      if (key === 'OR') return value.some(w => matches(row, w));
      const actual = row[key];
      if (value instanceof Date) return new Date(actual).getTime() === value.getTime();
      if (value && typeof value === 'object') {
        return Object.entries(value).every(([op, v]) => {
          if (op === 'notIn') return !v.includes(actual);
          if (op === 'lte') return actual <= v;
          if (op === 'lt') return actual < v;
          if (op === 'gte') return actual >= v;
          if (op === 'gt') return actual > v;
          if (op === 'equals') return v instanceof Date ? new Date(actual).getTime() === v.getTime() : actual === v;
          throw new Error('Unsupported condition ' + op);
        });
      }
      return actual === value;
    });
  }
  function apply(row, data) {
    for (const [key, value] of Object.entries(data)) {
      row[key] = value && typeof value === 'object' && 'increment' in value
        ? row[key] + value.increment : clone(value);
    }
  }
  function client(kind) {
    function write(table, method, where) {
      if (kind === 'ROOT' && state.tx) throw new Error('ROOT_WRITE_ESCAPED_TX');
      state.writes.push({ kind, table, method, where: clone(where ?? {}) });
    }
    return {
      billingrecord: {
        async findUnique({ where }) {
          const result = clone(state.orders[where.id] ?? null);
          if (options.expiryRace && !injected) {
            injected = true;
            state.orders[where.id].status = 'SUCCESS';
            state.orders[where.id].metadata.seatsAdded = 2;
            state.workspace.extraSeats = 2;
            state.events.push('Other admitted request commits after stale PENDING read');
          }
          return result;
        },
        async create({ data }) { write('billingrecord', 'create'); state.orders[data.id] = clone(data); return clone(data); },
        async updateMany({ where, data }) {
          write('billingrecord', 'updateMany', where);
          if (kind === 'TX' && options.waitAtOrderWrite) {
            instant += 2000;
            state.events.push('Clock advances inside first conditional write, after callback sampled now, before condition evaluation');
          }
          const row = state.orders[where.id];
          if (!row || !matches(row, where)) return { count: 0 };
          apply(row, data); return { count: 1 };
        },
      },
      workspace: {
        async findUnique({ where, select }) {
          if (where.id !== state.workspace.id) return null;
          if (kind === 'TX' && options.waitAtWorkspaceRead) {
            instant += 2000;
            state.events.push('Clock advances during transaction workspace read, before seat write');
          }
          const row = clone(state.workspace);
          return select ? Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, row[k]])) : row;
        },
        async updateMany({ where, data }) {
          write('workspace', 'updateMany', where);
          if (options.failWorkspace) throw new Error('INJECTED_WORKSPACE_FAILURE');
          if (options.changeAtSeatWrite) Object.assign(state.workspace, options.changeAtSeatWrite);
          if (options.advanceAtSeatWrite) { instant += 2000; state.events.push('Clock crosses plan deadline before conditional workspace write'); }
          if (!matches(state.workspace, where)) return { count: 0 };
          apply(state.workspace, data); return { count: 1 };
        },
      },
      workspaceplan: { async findUnique() { return { key: 'PRO', maxMembers: 5, priceMonthly: 2600 }; } },
    };
  }
  const prisma = { ...client('ROOT'), $transaction(fn) {
    const run = async () => {
      if (options.advanceAtTransaction) { instant += 2000; state.events.push('Clock crosses order deadline after precheck, before transaction'); }
      const beforeOrders = clone(state.orders), beforeWorkspace = clone(state.workspace);
      state.tx++;
      try { const result = await fn(client('TX')); if (options.failCommit) throw new Error('INJECTED_COMMIT_FAILURE'); return result; }
      catch (e) { state.orders = beforeOrders; state.workspace = beforeWorkspace; throw e; }
      finally { state.tx--; }
    };
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  } };
  const deps = { '@/lib/prisma': { prisma } };
  const expiry = load('src/lib/order-expiry.ts', deps, Clock);
  const seat = load('src/lib/payment/seat-addon-fulfill.ts', { ...deps, '@/lib/order-expiry': expiry }, Clock);
  const credit = { grantPoints() { throw new Error('Unexpected recharge'); }, getBalanceSummary: async () => ({}) };
  const auth = { validateUser: async () => ({ valid: true, user: { id: 'u1' } }) };
  const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
  const gateway = { resolvePaymentMode: () => 'REAL', createCharge: async p => { state.charges++; return ({ mode: 'REAL',
    payUrl: '/user/pay/qr?orderNo=' + p.orderNo, gatewayPayload: { codeUrl: 'weixin://isolated-fixture-no-payment' } }); } };
  const fulfill = load('src/lib/payment/fulfill.ts', { ...deps, '@/lib/order-expiry': expiry,
    '@/lib/payment/seat-addon-fulfill': seat, '@/lib/credit-service': credit }, Clock);
  const mock = load('src/app/api/payments/mock/confirm/route.ts', { ...deps, 'next/server': next, '@/lib/auth': auth,
    '@/lib/order-expiry': expiry, '@/lib/payment/seat-addon-fulfill': seat, '@/lib/credit-service': credit,
    '@/lib/payment-gateway': { resolvePaymentMode: () => 'MOCK' },
    '@/lib/workspace-upgrade-service': { fulfillEnterpriseUpgradeFromOrder() { throw new Error('Unexpected upgrade'); } },
  }, Clock);
  const readonly = load('src/lib/workspace-readonly-guard.ts', deps, Clock);
  const addon = load('src/app/api/workspace/seat-addon/route.ts', { ...deps, 'next/server': next, crypto,
    '@/lib/auth': auth, '@/lib/workspace-readonly-guard': readonly, '@/lib/order-expiry': expiry,
    '@/lib/payment-gateway': gateway }, Clock);
  const query = load('src/app/api/payments/order/route.ts', { ...deps, 'next/server': next, '@/lib/auth': auth }, Clock);
  const input = { orderNo: 'SA_fixture', paymentMode: 'REAL', isRealPayment: true, gatewayAmountCents: 2600,
    paymentMethod: 'WECHAT_PAY', remark: 'memory-only' };
  return { state, seat, fulfill, mock, addon, query, input, now: () => instant };
}
const req = body => ({ headers: new Headers(), json: async () => body });
async function execute(c, path) {
  if (path === 'shared') return c.seat.fulfillSeatAddonOrder(c.input);
  if (path === 'real_wrapper') return c.fulfill.fulfillPaidOrder(c.input);
  const res = await c.mock.POST(req({ orderNo: c.input.orderNo }));
  return { httpStatus: res.status, body: await res.json() };
}
function result(name, c, response) {
  const order = c.state.orders[c.input.orderNo];
  return { scenario: name, response, orderStatus: order.status, extraSeats: c.state.workspace.extraSeats,
    now: new Date(c.now()), orderExpiresAt: order.expiresAt, planExpiresAt: c.state.workspace.planExpiresAt,
    writes: c.state.writes, events: c.state.events };
}
const tick = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  return node?.props ? textOf(node.props.children) : '';
}
function nodes(node, predicate, out = []) {
  if (Array.isArray(node)) node.forEach(n => nodes(n, predicate, out));
  else if (node?.props) { if (predicate(node)) out.push(node); nodes(node.props.children, predicate, out); }
  return out;
}
async function mockPage(initialStatus, duplicate = false) {
  let index = 0, effects = [], firstRender = true;
  const states = [], data = { orderNo: 'SA_fixture', title: '席位订单', type: 'SEAT_ADDON', seats: 2,
    amountCents: 2600, points: 0, channel: 'WECHAT_PAY', status: initialStatus };
  const jsx = (type, props) => ({ type, props });
  const display = load('src/lib/payment-cashier-display.ts', {});
  // Invoke the actual inner component; replace only hook/render/network IO.
  const source = read('src/app/user/pay/mock/page.tsx');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const stubs = {};
  const react = { Suspense: 'Suspense', useCallback: fn => fn, useEffect: fn => { if (firstRender) effects.push(fn); },
    useState: initial => { const slot = index++; if (!(slot in states)) states[slot] = initial;
      return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; } };
  Object.assign(stubs, { react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => ({ back() {} }), useSearchParams: () => ({ get: () => 'SA_fixture' }) },
    'next/link': { default: 'Link', __esModule: true }, '@/utils/auth': { getAuthToken: () => 'fixture' },
    '@/lib/payment-cashier-display': display, 'lucide-react': { AlertTriangle: 'Alert', CheckCircle2: 'Check', CreditCard: 'Card', Loader2: 'Loader' } });
  const exports = {};
  vm.runInNewContext(js + '\nexports.__inner = MockCashierInner;', { exports,
    require: name => { if (!Object.hasOwn(stubs, name)) throw new Error('Denied ' + name); return stubs[name]; },
    fetch: async (_url, init) => new Response(JSON.stringify(init?.method === 'POST'
      ? { success: true, alreadyProcessed: duplicate, seats: 2, message: duplicate ? '该订单此前已完成入账，未重复扣款。' : '模拟收款成功，已为空间增购 2 个席位（非真实扣款）' }
      : { success: true, data }), { status: 200 }),
  });
  function render() { index = 0; return exports.__inner(); }
  render(); firstRender = false; for (const effect of effects) effect(); await tick();
  let tree = render();
  if (duplicate) { const button = nodes(tree, n => n.type === 'button' && textOf(n).includes('模拟支付成功'))[0];
    assert.ok(button); button.props.onClick(); await tick(); tree = render(); }
  return { initialStatus, duplicate, orderStatus: states[0]?.status, resultState: states[3], text: textOf(tree),
    links: nodes(tree, n => n.type === 'Link').map(n => ({ href: n.props.href, label: textOf(n) })),
    payButton: nodes(tree, n => n.type === 'button' && textOf(n).includes('模拟支付成功')).map(n => ({ disabled: n.props.disabled })) };
}
function qrPage(status) {
  let index = 0;
  const values = [{ orderNo: 'SA_fixture', type: 'SEAT_ADDON', seats: 2, status, amountCents: 2600,
    title: '席位订单', expiresAt: null, codeUrl: 'weixin://isolated' }, false, null, 'data:image/png;fixture'];
  const jsx = (type, props) => ({ type, props });
  const page = load('src/app/user/pay/qr/page.tsx', {
    react: { useState: () => [values[index++], () => {}], useCallback: fn => fn, useEffect() {}, useRef: () => ({ current: null }) },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => ({ get: () => 'SA_fixture' }) },
    qrcode: { toDataURL() { throw new Error('No QR generation expected in render fixture'); } },
    '@/utils/auth': { getAuthToken: () => 'fixture' },
    '@/lib/payment-cashier-display': load('src/lib/payment-cashier-display.ts', {}),
    'lucide-react': { AlertTriangle: 'Alert', CheckCircle2: 'Check', CreditCard: 'Card', Loader2: 'Loader' },
  });
  return { status, text: textOf(page.default()) };
}

async function main() {
  const controls = [], observations = [], cycles = [];
  const normal = setup();
  const rs = await Promise.all([execute(normal, 'shared'), execute(normal, 'shared')]);
  assert.equal(normal.state.workspace.extraSeats, 2);
  assert.equal(rs.filter(r => r.status === 'FULFILLED').length, 1);
  controls.push(result('same_order_once_preserved', normal, rs));
  for (const key of ['failWorkspace', 'failCommit']) {
    const c = setup({ [key]: true }); const r = await execute(c, 'shared');
    assert.equal(r.ok, false); assert.equal(c.state.workspace.extraSeats, 0);
    assert.equal(c.state.orders.SA_fixture.status, 'PENDING');
    controls.push(result(key + '_rollback_preserved', c, r));
  }
  for (const path of ['shared', 'real_wrapper', 'mock_route']) {
    const stale = setup({ expiryRace: true });
    stale.state.orders.SA_fixture.expiresAt = new Date(stale.now() - 1000);
    const staleResult = await execute(stale, path);
    assert.equal(stale.state.orders.SA_fixture.status, 'SUCCESS');
    assert.equal(stale.state.workspace.extraSeats, 2);
    controls.push(result('stale_expiry_no_overwrite_' + path, stale, staleResult));
    const before = setup({ nearOrderExpiry: true, advanceAtTransaction: true });
    const rejected = await execute(before, path);
    assert.equal(before.state.workspace.extraSeats, 0);
    assert.equal(before.state.orders.SA_fixture.status, 'EXPIRED');
    controls.push(result('cross_before_callback_fixed_' + path, before, rejected));
    const after = setup({ nearOrderExpiry: true, waitAtOrderWrite: true });
    const admitted = await execute(after, path);
    assert.equal(after.state.orders.SA_fixture.status, 'SUCCESS');
    assert.equal(after.state.workspace.extraSeats, 2);
    assert.ok(after.now() > after.state.orders.SA_fixture.expiresAt.getTime());
    observations.push(result('cross_during_order_update_' + path, after, admitted));
  }
  const planBefore = setup({ nearPlanExpiry: true, advanceAtTransaction: true });
  const planRejected = await execute(planBefore, 'shared');
  assert.equal(planRejected.ok, false); assert.equal(planBefore.state.workspace.extraSeats, 0);
  assert.equal(planBefore.state.orders.SA_fixture.status, 'PENDING');
  controls.push(result('plan_cross_before_callback_fixed', planBefore, planRejected));
  for (const stage of ['waitAtOrderWrite', 'waitAtWorkspaceRead', 'advanceAtSeatWrite']) {
    const c = setup({ nearPlanExpiry: true, [stage]: true });
    const r = await execute(c, 'shared');
    assert.equal(r.status, 'FULFILLED'); assert.equal(c.state.workspace.extraSeats, 2);
    assert.ok(c.now() > c.state.workspace.planExpiresAt.getTime());
    observations.push(result('plan_cross_after_callback_' + stage, c, r));
  }
  for (const cycle of [null, '', 'WEEK', 'MONTH', 'YEAR']) {
    const c = setup({ cycle });
    const created = await c.addon.POST(req({ workspaceId: 'w1', seats: 2 }));
    const body = await created.json();
    if (cycle === 'MONTH' || cycle === 'YEAR') {
      assert.equal(created.status, 200);
      const order = c.state.orders[body.orderNo];
      const response = await c.query.GET({ headers: new Headers(), nextUrl: new URL('http://isolated/?orderNo=' + body.orderNo) });
      const q = await response.json(); assert.ok(q.data.codeUrl);
      const r = await c.seat.fulfillSeatAddonOrder({ ...c.input, orderNo: body.orderNo, gatewayAmountCents: order.amount });
      assert.equal(r.status, 'FULFILLED');
      cycles.push({ cycle, status: created.status, chargeCalls: c.state.charges, queriedCarrier: !!q.data.codeUrl, fulfillment: r.status });
    } else {
      assert.equal(created.status, 400); assert.equal(c.state.charges, 0);
      assert.equal(Object.keys(c.state.orders).length, 1);
      assert.equal(c.state.orders.SA_fixture.status, 'PENDING');
      cycles.push({ cycle, status: created.status, chargeCalls: c.state.charges, newOrders: Object.keys(c.state.orders).length - 1 });
    }
  }
  const success = await mockPage('SUCCESS'), duplicate = await mockPage('PENDING', true);
  for (const ui of [success, duplicate]) {
    assert.equal(ui.orderStatus, 'SUCCESS'); assert.equal(ui.payButton.length, 0);
    assert.ok(ui.links.some(l => l.href === '/workspace-hub'));
  }
  const qr = qrPage('SUCCESS'); assert.ok(qr.text.includes('已为空间增购 2 个席位'));
  const manifest = JSON.parse(read('docs/reviews/R0-B2-fix-snapshot/manifest.json'));
  const snapshots = Object.entries(manifest.files).map(([file, entry]) => ({
    file, currentMatchesEnd: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') === entry.b2EndSha256,
    copyMatchesEnd: crypto.createHash('sha256').update(fs.readFileSync('docs/reviews/R0-B2-fix-snapshot/' + entry.frozenCopy)).digest('hex') === entry.b2EndSha256,
  }));
  assert.ok(snapshots.every(r => r.currentMatchesEnd && r.copyMatchesEnd));
  for (const file of ['src/app/api/__tests__/r0b-seat-addon.test.ts', 'docs/reviews/R0-B2-fix-report.md',
    'docs/reviews/R0-B2-fix-snapshot/verify-b2-cashier.cjs']) read(file);
  const evidence = { capturedAt: new Date().toISOString(), controls, observations, cycleControls: cycles,
    mockComponentSuccess: success, mockComponentDuplicate: duplicate, qrComponentSuccess: qr, endSnapshots: snapshots,
    verdict: 'B2-2/B2-3 closed at source and isolated level; B2-4 dangerous deletion corrected with rollback evidence limitation; B2-1 only fixes waiting before callback, not waits inside async transaction operations.',
    isolation: 'Actual service, REAL wrapper, MOCK route, order-expiry, read-only guard, create/order routes and real cashier components; all persistence/provider/auth/fetch/hooks/render IO are local closed stubs. Clock advances inside simulated awaited IO. No real data or fees.',
    limits: 'Not a real MySQL lock execution, online incident or production readiness proof. Component hook/JSX invocation is not browser DOM. End snapshots do not reconstruct missing start file contents. No rollback performed.', sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ controls: controls.length, sameUnclosedRequirementCases: observations.map(r => ({
    scenario: r.scenario, orderStatus: r.orderStatus, extraSeats: r.extraSeats, response: r.response, now: r.now, orderExpiresAt: r.orderExpiresAt, planExpiresAt: r.planExpiresAt
  })), cycleControls: cycles, successfulMockPagesNowHaveWorkspaceEntry: true, endSnapshotCopies: snapshots.length }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

