// Next batch evidence for original proposal F06 only. Actual code, memory-only database and IO.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-C-independent-review';
const hashes = {};
const copy = v => structuredClone(v);
function read(file) {
  const bytes = fs.readFileSync(file);
  hashes[file] = crypto.createHash('sha256').update(bytes).digest('hex');
  return bytes.toString('utf8');
}
function load(file, stubs) {
  const js = ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, crypto, Date, Error, Headers, Response,
    console: { log() {}, warn() {}, error() {} }, process: { env: {} },
    require(name) { if (Object.hasOwn(stubs, name)) return stubs[name]; throw new Error('Dependency denied ' + name); },
  }, { filename: file });
  return exports;
}
function setup({ role = 'OWNER', sourceType = 'OFFLINE_RECHARGE', authenticated = true, member = true, serviceFile = 'src/lib/credit-service.ts' } = {}) {
  const actorId = role === 'OWNER' ? 'owner' : role === 'PLATFORM_ADMIN' ? 'platform-admin' : 'staff';
  const s = { pool: 100n, wallets: {}, grants: [{ id: 'source', scope: 'WORKSPACE', workspaceId: 'w1',
    points: 100n, remaining: 100n, status: 'ACTIVE', sourceType, expiresAt: new Date('2030-01-01T00:00:00Z') }],
    ledgers: [], writes: [], audits: 0, notifications: 0, txCount: 0 };
  const workspace = { id: 'w1', name: 'fixture', type: 'ENTERPRISE', status: 'ACTIVE', ownerId: 'owner', plan: 'PRO' };
  let depth = 0;
  function client(kind) {
    const log = (model, method) => { if (kind === 'ROOT' && depth) throw new Error('Root mutation during tx'); s.writes.push({ kind, model, method }); };
    return {
      workspace: { findUnique: async () => copy(workspace) },
      workspacemember: { findUnique: async () => member ? { role: role === 'OWNER' ? 'OWNER' : role === 'ADMIN' ? 'ADMIN' : 'MEMBER' } : null },
      user: { findUnique: async () => ({ id: actorId, role: role === 'PLATFORM_ADMIN' ? 'ADMIN' : 'USER' }) },
      workspacequota: {
        findUnique: async () => ({ tokenBalance: s.pool, poolLowThreshold: null }),
        update: async ({ data }) => { log('workspacequota', 'update'); s.pool -= data.tokenBalance.decrement; return { tokenBalance: s.pool }; },
      },
      userwallet: { upsert: async ({ where, create, update }) => {
        log('userwallet', 'upsert');
        s.wallets[where.userId] = Object.hasOwn(s.wallets, where.userId) ? s.wallets[where.userId] + update.balance.increment : create.balance;
        return { userId: where.userId, balance: s.wallets[where.userId] };
      } },
      pointgrant: { create: async ({ data }) => { log('pointgrant', 'create'); s.grants.push(copy(data)); return copy(data); } },
      pointledger: { create: async ({ data }) => { log('pointledger', 'create'); s.ledgers.push(copy(data)); return copy(data); } },
    };
  }
  const prisma = { ...client('ROOT'), $transaction: async fn => {
    s.txCount++; const before = copy(s); depth++;
    try { return await fn(client('TX')); }
    catch (e) { Object.assign(s, before); throw e; }
    finally { depth--; }
  } };
  const notice = { addNotification: async () => { s.notifications++; } };
  const readonly = load('src/lib/workspace-readonly-guard.ts', { '@/lib/prisma': { prisma } });
  const credit = load(serviceFile, {
    '@/lib/prisma': { prisma }, '@prisma/client': { Prisma: {} }, '@/lib/notifications-store': notice,
    '@/lib/workspace-readonly-guard': readonly, '@/lib/register-gift-config': {}, '@/lib/points-notifications': {},
  });
  const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
  const auth = { validateUser: async () => authenticated ? { valid: true, user: { id: actorId } } : { valid: false },
    isAdminRole: role => role === 'ADMIN' };
  const security = { requireWorkspaceMembership: async () => member, writeAuditLog: async () => { s.audits++; } };
  const shared = { 'next/server': next, '@/lib/prisma': { prisma }, '@/lib/auth': auth,
    '@/lib/credit-service': credit, '@/lib/security': security };
  const route = load('src/app/api/workspace/quota/recycle/route.ts', { ...shared,
    '@/lib/workspace-readonly-guard': readonly, '@/lib/notifications-store': notice,
    '@/constants/workspace-plans': { resolvePoolLowThreshold: () => 500 },
  });
  const admin = load('src/app/api/admin/workspaces/recycle/route.ts', shared);
  return { s, credit, route, admin, actorId };
}
const req = () => ({ headers: new Headers(), json: async () => ({ workspaceId: 'w1', points: 100 }) });
function result(name, c, response) {
  return { scenario: name, actor: c.actorId, response, poolSnapshot: c.s.pool, wallets: c.s.wallets,
    originalGrant: c.s.grants[0], destinationGrant: c.s.grants[1] ?? null,
    grantRemainingSum: c.s.grants.reduce((a,g) => a + g.remaining, 0n), writes: c.s.writes, ledgerCount: c.s.ledgers.length };
}

function declarationMap(source, file) {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = {};
  function visit(n) {
    if (ts.isFunctionDeclaration(n) && n.name) out[n.name.text] = n.getText(root).replace(/\r\n/g, '\n');
    if (ts.isVariableDeclaration(n) && n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer) ||
      (ts.isCallExpression(n.initializer) && n.initializer.arguments[0] && ts.isArrowFunction(n.initializer.arguments[0]))))
      out[n.name.getText(root)] = n.initializer.getText(root).replace(/\r\n/g, '\n');
    ts.forEachChild(n, visit);
  }
  visit(root); return out;
}
async function main() {
  const cases = [];
  function unchanged(c) {
    assert.equal(c.s.txCount, 0); assert.equal(c.s.writes.length, 0);
    assert.equal(c.s.pool, 100n); assert.equal(c.s.grants.length, 1);
    assert.equal(c.s.grants[0].remaining, 100n); assert.deepEqual(c.s.wallets, {});
    assert.equal(c.s.ledgers.length, 0); assert.equal(c.s.audits, 0); assert.equal(c.s.notifications, 0);
  }
  const code = 'ENTERPRISE_POOL_RECYCLE_DISABLED';
  for (const sourceType of ['OFFLINE_RECHARGE', 'GIFT_BONUS']) {
    const c = setup({ sourceType });
    for (let i=0;i<5;i++) await assert.rejects(c.credit.recycleEnterprisePool({ workspaceId: 'w1', userId: 'someone', points: 100 }), { message: code });
    unchanged(c); cases.push({ id: 'C01_C05', sourceType, txCount: c.s.txCount, writes: c.s.writes, originalGrant: c.s.grants[0], pool: c.s.pool, wallets: c.s.wallets });
  }
  for (const role of ['OWNER', 'ADMIN', 'PLATFORM_ADMIN']) {
    const c = setup({ role }), route = role === 'PLATFORM_ADMIN' ? c.admin : c.route;
    const responses = await Promise.all(Array.from({ length: 6 }, () => route.POST(req())));
    const bodies = [];
    for (const response of responses) {
      const body = await response.json();
      assert.equal(response.status, 409); assert.equal(body.success, false); assert.equal(body.code, code);
      assert.equal(body.walletBalance, undefined); assert.equal(body.recycledPoints, undefined);
      bodies.push({ httpStatus: response.status, body });
    }
    unchanged(c); cases.push({ id: role === 'PLATFORM_ADMIN' ? 'C03_C05' : 'C02_C05', role, responses: bodies, txCount: c.s.txCount, writes: c.s.writes });
  }
  for (const options of [{ authenticated: false }, { role: 'ADMIN', member: false }, { role: 'MEMBER' }]) {
    const c = setup(options), response = await c.route.POST(req());
    assert.equal(response.status, options.authenticated === false ? 401 : 403); unchanged(c);
    cases.push({ id: 'C04_workspace', options, httpStatus: response.status, body: await response.json() });
  }
  for (const options of [{ role: 'OWNER' }, { role: 'PLATFORM_ADMIN', authenticated: false }]) {
    const c = setup(options), response = await c.admin.POST(req());
    assert.equal(response.status, options.authenticated === false ? 401 : 403); unchanged(c);
    cases.push({ id: 'C04_admin', options, httpStatus: response.status, body: await response.json() });
  }
  const manifest = JSON.parse(read('docs/reviews/R0-C-fix-snapshot/manifest.json'));
  const previous = JSON.parse(read('docs/reviews/R0-B3-independent-review/next-pool-verification.json'));
  const snapshots = manifest.files.map(entry => {
    const name = entry.path.replaceAll('/', '__') + '.frozen';
    const start = read('docs/reviews/R0-C-fix-snapshot/frozen-source/' + name);
    const end = read('docs/reviews/R0-C-fix-snapshot/end-source/' + name);
    read(entry.path);
    return { file: entry.path, startMatchesManifest: hashes['docs/reviews/R0-C-fix-snapshot/frozen-source/' + name] === entry.startSha256,
      startMatchesPreviousAudit: previous.sha256[entry.path] === entry.startSha256,
      endMatchesManifest: hashes['docs/reviews/R0-C-fix-snapshot/end-source/' + name] === entry.endSha256,
      currentMatchesEnd: hashes[entry.path] === entry.endSha256 };
  });
  assert.ok(snapshots.every(r => Object.entries(r).every(([k,v]) => k === 'file' || v)));
  const oldCredit = read('docs/reviews/R0-C-fix-snapshot/frozen-source/src__lib__credit-service.ts.frozen');
  const newCredit = read('src/lib/credit-service.ts');
  const oldFns = declarationMap(oldCredit, 'credit.ts'), newFns = declarationMap(newCredit, 'credit.ts');
  const adjacent = Object.keys(oldFns).filter(name => name !== 'recycleEnterprisePool').map(name => ({
    name, unchanged: oldFns[name] === newFns[name],
  }));
  for (const name of ['grantPoints', 'consumePoints', 'refundConsumedPoints', 'transferPoints', 'getBalanceSummary'])
    assert.ok(adjacent.some(r => r.name === name), 'Missing adjacent function ' + name);
  assert.ok(adjacent.every(r => r.unchanged));
  const uiChecks = [];
  for (const [file, names] of [
    ['src/components/EnterprisePoolManager.tsx', ['loadPools', 'handleSaveThreshold', 'validateThreshold']],
    ['src/components/WorkspaceInternalLayoutV3.tsx', ['handleExecuteRecharge', 'handleSavePoolThreshold']],
  ]) {
    const old = declarationMap(read('docs/reviews/R0-C-fix-snapshot/frozen-source/' + file.replaceAll('/', '__') + '.frozen'), file);
    const current = declarationMap(read(file), file);
    for (const name of names) { assert.ok(old[name]); assert.equal(old[name], current[name]); uiChecks.push({ file, name, unchanged: true }); }
  }
  const frozenAudit = JSON.parse(read('docs/reviews/R0-B3-independent-review/verification.json'));
  const frozenChecks = Object.keys(frozenAudit.sha256).filter(f => f.startsWith('src/') && !manifest.files.some(entry => entry.path === f)).map(file => {
    read(file); return { file, unchanged: hashes[file] === frozenAudit.sha256[file] };
  });
  assert.ok(frozenChecks.every(r => r.unchanged));
  for (const file of ['src/app/api/__tests__/r0c-pool-recycle.test.ts', 'docs/reviews/R0-C-fix-report.md',
    'docs/reviews/R0-C-fix-snapshot/verify-r0c-pages.cjs']) read(file);
  const evidence = { capturedAt: new Date().toISOString(), verdict: 'PASS R0-C bounded source/isolated stop-loss; freeze batch',
    actualServiceAndRouteCases: cases, snapshots, adjacentCreditFunctions: adjacent, adjacentUIHandlers: uiChecks, frozenChecks,
    isolation: 'Actual complete credit-service, both POST routes and actual read-only guard loaded with closed memory persistence and identity/notification IO fixtures. Direct and repeated/concurrent requests assert zero tx and zero business writes.',
    limits: 'UI rendering checked separately by 18-case controlled component script. Adjacent successful ledger flows are preserved by exact function-body comparison, not real-money E2E testing. No real DB, provider, deployment, migration or historical correction. Transfer remains paused, not restored.', sha256: hashes };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(evidence, (_k,v) => typeof v === 'bigint' ? String(v) : v, 2));
  console.log(JSON.stringify({ verdict: evidence.verdict, backendCases: cases.length, snapshots: snapshots.length,
    adjacentCreditFunctionBodiesUnchanged: adjacent.length, adjacentUIHandlersUnchanged: uiChecks.length, frozenSourceFilesUnchanged: frozenChecks.length }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });

