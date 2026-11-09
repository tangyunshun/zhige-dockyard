// Independent audit reproduction. All persistence, auth and external effects are stubs.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const assert = require('node:assert/strict');
const files = new Set();
const dir = 'docs/reviews/R0-A-independent-review';
function load(file, stubs = {}) {
  files.add(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, crypto, Response, Headers, Date, JSON, console,
    require: name => {
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name === 'crypto') return crypto;
      throw new Error('Unstubbed dependency: ' + name);
    },
  }, { filename: file });
  return exports;
}
const next = { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } };
const constants = load('src/constants/workspace-plans.ts');
const limits = load('src/lib/limit-utils.ts');
const req = body => ({ headers: new Headers({ authorization: 'Bearer isolated.stub' }), json: async () => body });
function context(rowFor) {
  const writes = [], effects = [];
  const level = { id: 'FREE', name: 'FREE', nameZh: 'Free', maxEnterpriseWorkspaces: 5, maxTeamSize: -1, maxStorage: 0n, maxApiCalls: 0n };
  const prisma = {
    workspaceplan: { findUnique: async ({ where }) => rowFor(where.key) },
    user: { findUnique: async () => ({ id: 'u1', membershipLevel: 'FREE', role: 'user', name: 'User' }) },
    membershiplevel: { findUnique: async () => level, findFirst: async () => level },
    workspace: {
      findMany: async () => [], count: async () => 0,
      findUnique: async () => ({ id: 'ws1', ownerId: 'u1', name: 'Personal', type: 'PERSONAL' }),
      create: async ({ data }) => { writes.push({ table: 'workspace', plan: data.plan, maxMembers: data.quota.maxMembers }); return { ...data, id: 'created-ws' }; },
    },
    operationlog: { create: async () => { writes.push({ table: 'operationlog' }); return {}; } },
  };
  const planService = load('src/lib/workspace-plan-service.ts', { '@/lib/prisma': { prisma }, '@/constants/workspace-plans': constants });
  const stubs = {
    'next/server': next, '@/lib/prisma': { prisma },
    '@/lib/auth': { validateUser: async () => ({ valid: true, user: { id: 'u1', role: 'user' } }), isAdminRole: () => false },
    '@/lib/workspace-naming': { generateEnterpriseWorkspaceName: async () => 'Mock enterprise' },
    '@/lib/membership': { TEAM_SIZE_OPTIONS: [] },
    '@/lib/workspaceInit': { ensureDefaultComponents: async () => { effects.push('assemble'); } },
    '@/constants/workspace-plans': constants, '@/lib/workspace-plan-service': planService, '@/lib/limit-utils': limits,
    '@/lib/platform-default-models': { inheritFreeDefaultModelsForNewWorkspace: async () => {} },
    '@/lib/new-space-trial-quota': { grantNewSpaceTrialQuota: async () => { effects.push('trial'); } },
    '@/lib/serverCache': { clearServerCache: () => {} },
    '@/lib/workspace-readonly-guard': { assertWorkspaceWritable: async () => {} },
    '@/lib/payment-gateway': { createCharge: async () => { throw new Error('Payment must not be called'); }, resolvePaymentMode: () => 'REAL' },
    '@/lib/order-expiry': { newOrderExpiry: () => new Date('2030-01-01') },
    '@/lib/workspace-upgrade-service': { provisionEnterpriseUpgrade: async input => { effects.push({ type: 'provision-called', target: input.targetPlanKey }); return { newWorkspaceId: 'stub-provisioned', message: 'stub', giftMigrated: 0 }; } },
  };
  return { prisma, planService, stubs, writes, effects };
}
const row = key => ({ key, name: key, isActive: true, purchasable: true, priceMonthly: 0, priceYearly: 0, maxMembers: -1, maxComponents: -1, maxStorage: 10000, maxApiCalls: -1, features: [], trialGift: { enabled: false, points: 0, expireDays: 0 } });
(async () => {
  const results = [];
  for (const [route, body] of [
    ['src/app/api/workspace/create-enterprise/route.ts', { name: 'Test', plan: 'PRO', contactEmail: 'audit@example.invalid' }],
    ['src/app/api/user/workspaces/create/route.ts', { name: 'Test', type: 'ENTERPRISE', plan: 'PRO' }],
  ]) {
    const c = context(key => row(key));
    const module = load(route, c.stubs);
    const response = await module.POST(req(body));
    assert.equal(response.status, 200);
    assert.equal(c.writes[0].plan, 'PRO');
    results.push({ scenario: 'unapproved_zero_price_non_base_plan', route, httpStatus: response.status, writes: c.writes, effects: c.effects, meaning: 'Current check accepts PRO as FREE solely because its prices are zero, contrary to R0-A base-free-only rule.' });
  }
  for (const mode of ['paid-standard', 'missing-standard']) {
    const c = context(key => mode === 'missing-standard' ? null : { ...row(key), priceMonthly: 1000, priceYearly: 10000 });
    const module = load('src/app/api/user/workspaces/create/route.ts', c.stubs);
    const response = await module.POST(req({ name: 'Personal', type: 'PERSONAL' }));
    assert.equal(response.status, mode === 'paid-standard' ? 402 : 503);
    results.push({ scenario: 'personal_creation_now_depends_on_enterprise_checkout_gate', config: mode, httpStatus: response.status, body: await response.json(), writes: c.writes, meaning: 'New guard affects PERSONAL branch, which was explicitly outside the modification scope.' });
  }
  const c = context(() => { throw new Error('isolated transient config read failure'); });
  const upgrade = load('src/app/api/workspace/upgrade/route.ts', c.stubs);
  const response = await upgrade.POST(req({ workspaceId: 'ws1', targetPlan: 'STANDARD', option: 'upgrade' }));
  assert.equal(response.status, 200);
  assert.ok(c.effects.some(e => e?.type === 'provision-called'));
  results.push({ scenario: 'adjacent_upgrade_uses_fallback_on_config_failure', httpStatus: response.status, effects: c.effects, meaning: 'Real route and real fallback reader call provisioning after config failure. Provisioning is a stub: no claim of completed live rights mutation.' });
  const evidence = { capturedAt: new Date().toISOString(), kind: 'offline isolated audit; no real database or paid calls', results,
    sha256: Object.fromEntries([...files].map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])) };
  fs.writeFileSync(dir + '/verification.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ observedScenarios: results.length, results }));
})().catch(error => { console.error(error); process.exitCode = 1; });
