// Isolated verification: application dependencies are mocked; no network or DB calls.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(file, stubs) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (['fs', 'path'].includes(name)) return require(name);
    throw new Error('Unexpected dependency: ' + name);
  }, console, Response, Map, Set, Date, JSON, process: { cwd: () => process.cwd(), env: { NODE_ENV: 'test' } } }, { filename: file });
  return exports;
}
(async () => {
  const billing = load('src/lib/billing/billing-config.ts', { '@/lib/prisma': {} });
  const values = [10000, 10001, 20000, 100000, 1000000].map(value => ({ storedBps: value, parsedBps: billing.parseBillingConfig([{ key: 'billing.markupCoefficientBps', value: String(value) }]).markupCoefficientBps }));
  assert.equal(values[2].parsedBps, 2000);
  assert.equal(values[4].parsedBps, 100000);
  const security = load('src/lib/security.ts', {
    '@/lib/prisma': { prisma: { user: { findUnique: async () => ({ id: 'audit-mock', role: 'SUPER_ADMIN', status: 'active' }) } } },
    '@/lib/auth': { validateUser: async () => ({ valid: false, error: 'FORCED_LOGOUT' }) },
    '@/lib/ip-risk': {},
    'jose': { jwtVerify: async () => ({ payload: { userId: 'audit-mock' } }) },
    '@/lib/jwt-config': { getJwtSecretKey: () => new Uint8Array() },
  });
  const result = await security.requirePlatformAuth({ headers: new Headers({ authorization: 'Bearer mock.signed.jwt' }) });
  assert.equal(result.authorized, true);
  const summary = { kind: 'isolated reproduction, no live database or valid credentials', billing: values, platformAuth: { initialValidation: 'FORCED_LOGOUT', fallbackResult: result.authorized } };
  fs.writeFileSync('docs/code-facts-2026-11-05/verification.json', JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
})().catch(e => { console.error(e); process.exitCode = 1; });
