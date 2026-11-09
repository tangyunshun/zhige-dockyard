// Next batch evidence for original proposal F06 only. Actual code, memory-only database and IO.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const dir = 'docs/reviews/R0-B3-independent-review';
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
function setup({ role = 'OWNER', sourceType = 'OFFLINE_RECHARGE', authenticated = true, member = true } = {}) {
  const actorId = role === 'OWNER' ? 'owner' : role === 'PLATFORM_ADMIN' ? 'platform-admin' : 'staff';
  const s = { pool: 100n, wallets: {}, grants: [{ id: 'source', scope: 'WORKSPACE', workspaceId: 'w1',
    points: 100n, remaining: 100n, status: 'ACTIVE', sourceType, expiresAt: new Date('2030-01-01T00:00:00Z') }],
    ledgers: [], writes: [], audits: 0, notifications: 0 };
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
    const before = copy(s); depth++;
    try { return await fn(client('TX')); }
    catch (e) { Object.assign(s, before); throw e; }
    finally { depth--; }
  } };
  const notice = { addNotification: async () => { s.notifications++; } };
  const readonly = load('src/lib/workspace-readonly-guard.ts', { '@/lib/prisma': { prisma } });
  const credit = load('src/lib/credit-service.ts', {
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
async function main() {
  const observations = [], controls = [];
  for (const sourceType of ['OFFLINE_RECHARGE', 'GIFT_BONUS']) {
    const c = setup({ sourceType });
    const r = await c.credit.recycleEnterprisePool({ workspaceId: 'w1', userId: 'owner', points: 100 });
    assert.equal(c.s.pool, 0n); assert.equal(c.s.wallets.owner, 100n);
    assert.equal(c.s.grants[0].remaining, 100n); assert.equal(c.s.grants[1].remaining, 100n);
    assert.equal(c.s.grants[1].scope, 'WALLET'); assert.equal(c.s.grants[1].expiresAt, undefined);
    observations.push(result('source_grant_not_debited_' + sourceType, c, r));
  }
  for (const role of ['OWNER', 'ADMIN', 'PLATFORM_ADMIN']) {
    const c = setup({ role });
    const response = await (role === 'PLATFORM_ADMIN' ? c.admin : c.route).POST(req());
    const body = await response.json(); assert.equal(response.status, 200);
    const destination = role === 'ADMIN' ? 'staff' : 'owner';
    assert.equal(c.s.wallets[destination], 100n);
    observations.push(result('actual_route_' + role, c, { status: response.status, body }));
  }
  for (const options of [{ role: 'MEMBER' }, { role: 'ADMIN', member: false }, { authenticated: false }]) {
    const c = setup(options); const response = await c.route.POST(req());
    assert.equal(response.status, options.authenticated === false ? 401 : 403); assert.equal(c.s.writes.length, 0);
    controls.push(result('existing_auth_gate_' + JSON.stringify(options), c, { status: response.status }));
  }
  for (const file of ['src/components/EnterprisePoolManager.tsx', 'src/components/WorkspaceInternalLayoutV3.tsx',
    'src/components/workspace/RechargeModal.tsx', 'docs/product-business-review-2026-11-05/RESTRUCTURING-PROPOSAL.md']) read(file);
  const evidence = { capturedAt: new Date().toISOString(), originalPlanIssue: 'F06 enterprise pool recycle, not a new seat requirement',
    observations, controls,
    isolation: 'Actual full credit-service module, workspace/admin recycle POST handlers and read-only guard. All persistence, identity/membership IO, audit and notifications local stubs. Serial tx with rollback; no real business data or costs.',
    limits: 'Proves source/destination accounting inconsistency in controlled data and route role decisions with identity IO fixtures. Does not prove production balances, historical losses, cash withdrawability or all paths of double spending. No enterprise asset-to-person policy invented.', sha256: hashes };
  const json = JSON.stringify(evidence, (_k,v) => typeof v === 'bigint' ? v.toString() : v, 2);
  fs.writeFileSync(dir + '/next-pool-verification.json', json);
  console.log(JSON.stringify({ originalPlanIssue: 'F06', observations: observations.map(r => ({ scenario: r.scenario,
    poolSnapshot: String(r.poolSnapshot), wallets: Object.fromEntries(Object.entries(r.wallets).map(([k,v]) => [k,String(v)])),
    originalGrantRemaining: String(r.originalGrant.remaining), grantRemainingSum: String(r.grantRemainingSum) })), authControls: controls.length }, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
