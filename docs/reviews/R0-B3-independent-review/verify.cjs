// Independent, memory-only verification. No real Prisma, provider, env files or network imports.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-B3-independent-review';
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
      try { const result = await fn(client('TX')); if (options.advanceAtCommit) { instant += 2000; state.events.push('Clock advances only after callback authorization, at commit'); } if (options.failCommit) throw new Error('INJECTED_COMMIT_FAILURE'); return result; }
      catch (e) { state.orders = beforeOrders; state.workspace = beforeWorkspace; throw e; }
      finally { state.tx--; }
    };
    const result = queue.then(run, run); queue = result.catch(() => {}); return result;
  } };
  const deps = { '@/lib/prisma': { prisma } };
  const expiry = load('src/lib/order-expiry.ts', deps, Clock);
  const seat = load(options.serviceFile || 'src/lib/payment/seat-addon-fulfill.ts', { ...deps, '@/lib/order-expiry': expiry }, Clock);
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
  const oldFile = 'docs/reviews/R0-B3-fix-snapshot/frozen-source/src__lib__payment__seat-addon-fulfill.ts';
  const matrix = [], beforeAfter = [], controls = [];
  for (const target of ['order', 'plan']) {
    const c = setup({ advanceAtTransaction: true, [target === 'order' ? 'nearOrderExpiry' : 'nearPlanExpiry']: true });
    const r = await execute(c, 'shared');
    assert.equal(r.ok, false); assert.equal(c.state.workspace.extraSeats, 0);
    assert.equal(c.state.orders.SA_fixture.status, target === 'order' ? 'EXPIRED' : 'PENDING');
    matrix.push(result('T01_before_callback_' + target, c, r));
  }
  const stages = [
    { id: 'T02', options: { nearOrderExpiry: true, waitAtOrderWrite: true } },
    { id: 'T03', options: { nearPlanExpiry: true, waitAtOrderWrite: true } },
    { id: 'T04', options: { nearPlanExpiry: true, waitAtWorkspaceRead: true } },
    { id: 'T05', options: { nearPlanExpiry: true, advanceAtSeatWrite: true } },
  ];
  for (const stage of stages) {
    const old = setup({ ...stage.options, serviceFile: oldFile });
    const failed = await execute(old, 'shared');
    assert.equal(failed.status, 'FULFILLED'); assert.equal(old.state.workspace.extraSeats, 2);
    const c = setup(stage.options), r = await execute(c, 'shared');
    assert.equal(r.status, 'REJECTED'); assert.equal(c.state.workspace.extraSeats, 0);
    assert.equal(c.state.orders.SA_fixture.status, stage.id === 'T02' ? 'EXPIRED' : 'PENDING');
    assert.equal(c.state.orders.SA_fixture.metadata.seatsAdded, undefined);
    beforeAfter.push({ id: stage.id, before: result(stage.id + '_old', old, failed), after: result(stage.id + '_fixed', c, r) });
    matrix.push(result(stage.id, c, r));
  }
  for (const path of ['real_wrapper', 'mock_route']) {
    const c = setup(stages[0].options); const r = await execute(c, path);
    assert.equal(c.state.orders.SA_fixture.status, 'EXPIRED'); assert.equal(c.state.workspace.extraSeats, 0);
    controls.push(result('T02_other_entry_' + path, c, r));
  }
  const commit = setup({ nearOrderExpiry: true, advanceAtCommit: true });
  const committed = await execute(commit, 'shared');
  assert.equal(committed.status, 'FULFILLED'); assert.ok(commit.now() > commit.state.orders.SA_fixture.expiresAt.getTime());
  const repeated = await execute(commit, 'shared'); assert.equal(repeated.status, 'ALREADY_PROCESSED');
  assert.equal(commit.state.workspace.extraSeats, 2);
  matrix.push(result('T06_commit_only_crosses_deadline', commit, [committed, repeated]));
  for (const type of ['equal', 'null', 'normal']) {
    const c = setup();
    if (type === 'equal') c.state.orders.SA_fixture.expiresAt = new Date(c.now());
    if (type === 'null') c.state.orders.SA_fixture.expiresAt = null;
    const r = await execute(c, 'shared'); assert.equal(r.status, 'FULFILLED');
    matrix.push(result('T07_' + type, c, r));
  }
  const normal = setup();
  const rs = await Promise.all([execute(normal, 'shared'), execute(normal, 'shared')]);
  assert.equal(normal.state.workspace.extraSeats, 2);
  assert.equal(rs.filter(r => r.status === 'FULFILLED').length, 1);
  matrix.push(result('T08_concurrent_only_once', normal, rs));
  for (const key of ['failWorkspace', 'failCommit']) {
    const c = setup({ [key]: true }); const r = await execute(c, 'shared');
    assert.equal(r.ok, false); assert.equal(c.state.workspace.extraSeats, 0);
    assert.equal(c.state.orders.SA_fixture.status, 'PENDING');
    matrix.push(result('T08_' + key, c, r));
  }
  const invalidated = setup({ changeAtSeatWrite: { plan: 'ENTERPRISE' } });
  const rejected = await execute(invalidated, 'shared'); assert.equal(rejected.ok, false);
  assert.equal(invalidated.state.orders.SA_fixture.status, 'PENDING'); assert.equal(invalidated.state.workspace.extraSeats, 0);
  matrix.push(result('T08_quote_changes_at_write', invalidated, rejected));
  const manifest = JSON.parse(read('docs/reviews/R0-B3-fix-snapshot/manifest.json'));
  const previous = JSON.parse(read('docs/reviews/R0-B2-independent-review/verification.json'));
  const snapshotChecks = manifest.files.map(entry => {
    const filename = entry.path.replaceAll('/', '__');
    const startHash = crypto.createHash('sha256').update(fs.readFileSync('docs/reviews/R0-B3-fix-snapshot/frozen-source/' + filename)).digest('hex');
    const endHash = crypto.createHash('sha256').update(fs.readFileSync('docs/reviews/R0-B3-fix-snapshot/end-source/' + filename)).digest('hex');
    const currentHash = crypto.createHash('sha256').update(fs.readFileSync(entry.path)).digest('hex');
    return { file: entry.path, startMatchesPreviousAudit: startHash === previous.sha256[entry.path],
      startMatchesManifest: startHash === entry.startSha256, endMatchesManifest: endHash === entry.endSha256,
      currentMatchesEnd: currentHash === endHash };
  });
  assert.ok(snapshotChecks.every(r => Object.entries(r).every(([k,v]) => k === 'file' || v)));
  const frozenPaths = ['src/lib/payment/fulfill.ts', 'src/app/api/payments/mock/confirm/route.ts',
    'src/app/user/pay/qr/page.tsx', 'src/app/user/pay/mock/page.tsx', 'src/lib/payment-cashier-display.ts',
    'src/app/api/workspace/seat-addon/route.ts', 'src/lib/order-expiry.ts'];
  const frozenChecks = frozenPaths.map(file => { read(file); return { file, unchanged: hashes[file] === previous.sha256[file] }; });
  assert.ok(frozenChecks.every(r => r.unchanged));
  read('src/app/api/__tests__/r0b-seat-addon.test.ts'); read('docs/reviews/R0-B3-fix-report.md');
  const evidence = { capturedAt: new Date().toISOString(), verdict: 'PASS bounded R0-B3 source and isolated acceptance; freeze seat batch',
    fixedMatrix: matrix, beforeAfterSameIO: beforeAfter, otherEntries: controls, snapshotChecks, frozenChecks,
    isolation: 'Actual current and frozen start service loaded independently in separate memory fixtures. Actual REAL wrapper/MOCK route, expiry helper; closed IO stubs. No swapping/restoring current workspace source, DB, network or paid calls.',
    limits: 'Serial in-memory transactions simulate waits and undo. Not real MySQL locks, browser DOM, actual provider transaction or production/financial acceptance. Commit-only wait allowed by frozen policy.', sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ verdict: evidence.verdict, matrixScenarioCount: matrix.length,
    oldWrongFulfillmentsNowRejected: beforeAfter.map(r => r.id), otherEntries: controls.length,
    frozenFilesUnchanged: frozenChecks.length, snapshots: snapshotChecks }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

