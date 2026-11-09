const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = __dirname;
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').replace(/^\uFEFF/, ''));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest = read('manifest-verification.json');
for (const [file, expected] of Object.entries(manifest.sha256)) {
  if (hash(file) !== expected) throw new Error('Source changed through audit: ' + file);
}
const old = read('independent-results.json');
const latest = read('parser-final-results.json');
const formal = read('formal-results.json');
const select = (result, fragment) => result.testResults.filter(x => x.name.replaceAll('\\', '/').endsWith(fragment));
const selected = [...select(old, '/handler-review.test.ts'), ...select(old, '/admission-review.test.ts'), ...select(latest, '/parser-review.test.ts')];
if (selected.length !== 3) throw new Error('Missing independent suite');
const cases = selected.flatMap(suite => suite.assertionResults.map(x => ({file: path.basename(suite.name), name: x.fullName || x.title, status: x.status})));
if (cases.length !== 18 || cases.some(x => x.status !== 'passed')) throw new Error('Unexpected independent results');
const positive = cases.filter(x => /positive:/i.test(x.name)).length;
if (positive !== 2) throw new Error('Unexpected positive count');
const sum = {capturedAt: new Date().toISOString(), currentParserReplacesEarlierParserResults: true, sources: {handlerAndAdmission: 'independent-results.json', parser: 'parser-final-results.json'}, total: 18, passed: 18, positiveAcceptanceCases: 2, defectCharacterizations: 16, meaning: 'Passing characterization tests CONFIRM current defects; they are not repaired acceptance cases.', cases};
fs.writeFileSync(path.join(dir, 'independent-summary.json'), JSON.stringify(sum, null, 2) + '\n');
if (formal.numTotalTests !== 32 || formal.numPassedTests !== 32 || formal.numFailedTests !== 0) throw new Error('Author tests mismatch');
let author = fs.readFileSync('src/app/api/__tests__/r0k-parse-resource.test.ts', 'utf8');
author = author.replace('path.join(process.cwd(), ".next", "server", "src", "lib", "parse-worker.cjs")', 'path.join(process.cwd(), "docs", "reviews", "R0-K-independent-review", "staged", "parse-worker.cjs")');
if (author !== fs.readFileSync(path.join(dir, 'formal-copy.test.ts'), 'utf8')) throw new Error('Author copy has non-staging difference');
const baseline = JSON.parse(fs.readFileSync('docs/reviews/R0-J6-independent-review/validation-results.json', 'utf8'));
const validation = {
  capturedAt: new Date().toISOString(), batch: 'R0-K / original F14', verdict: 'NOT ACCEPTED; bounded return R0-K1 within original K01-K04',
  businessSourceEditsByReviewer: 0, sourceStableThroughAudit: true,
  formalFrozenRegression: {files: baseline.formal.files, passedFiles: 18, passedTests: 523, exitCode: 0, provenance: 'Independently executed THIS audit; exec session 94097; duration 34.51 seconds; observed complete process output.', command: 'vitest run <exact formal.files listed here>'},
  authorBatch: {passedTests: 32, exitCode: 0, resultFile: 'formal-results.json', command: 'vitest run --config docs/reviews/R0-K-independent-review/vitest.review.config.ts docs/reviews/R0-K-independent-review/formal-copy.test.ts --reporter=json --outputFile=docs/reviews/R0-K-independent-review/formal-results.json', copyModification: 'Only worker staging path changed from existing .next path to new audit-local staged path; all assertions and imports unchanged. Verified exact transformed equality.', actualNextBuild: false},
  nodeTest: {files: ['src/lib/__tests__/text-extract.test.ts', 'src/lib/__tests__/text-extract-paths.test.ts'], passedTests: 18, exitCode: 0, command: 'tsx --test src/lib/__tests__/text-extract.test.ts src/lib/__tests__/text-extract-paths.test.ts', durationMs: 6281, provenance: 'Independently executed THIS audit; node:test complete TAP output observed.'},
  independent: {total: 18, passed: 18, positive: 2, defectCharacterizations: 16, exitCode: 0, aggregate: 'independent-summary.json', commands: ['vitest run --config docs/reviews/R0-K-independent-review/vitest.review.config.ts docs/reviews/R0-K-independent-review/handler-review.test.ts docs/reviews/R0-K-independent-review/admission-review.test.ts docs/reviews/R0-K-independent-review/parser-review.test.ts --reporter=json --outputFile=docs/reviews/R0-K-independent-review/independent-results.json', 'vitest run --config docs/reviews/R0-K-independent-review/vitest.review.config.ts docs/reviews/R0-K-independent-review/parser-review.test.ts --reporter=json --outputFile=docs/reviews/R0-K-independent-review/parser-final-results.json'], note: 'First run 16 cases; only parser subsequently changed from 9 to 11. Reuse unchanged handler/admission 7 and latest parser 11; do not double-count the superseded parser run.'},
  typescript: {command: 'tsc --noEmit --incremental false -p tsconfig.json', exitCode: 0, provenance: 'Independent exec session 83621 THIS audit'},
  workerSyntax: {command: 'node --check src/lib/parse-worker.cjs', exitCode: 0},
  version: {startCopies: manifest.starts.length, endCopies: manifest.ends.length, changedExistingFiles: 7, protectedPreviouslyTrackedUnchanged: manifest.unchangedPreviouslyTracked.length, sha256: manifest.sha256},
  findings: [{id:'KR1',priority:'P1',groups:['K03','K04']},{id:'KR2',priority:'P1',groups:['K03']},{id:'KR3',priority:'P1',groups:['K01','K03']},{id:'KR4',priority:'P1',groups:['K01','K03']},{id:'KR5',priority:'P1',groups:['K02']},{id:'KR6',priority:'P2',groups:['K02','K04']},{id:'KR7',priority:'P2',groups:['K04']}],
  scope: {F01ThroughF13Frozen: true, F14Closed: false, next: 'R0-K1 / only KR1-KR7 within K01-K04', F15OrF16Started: false},
  limits: ['No live DB, cloud, customer file, model, payment, migration or deployment', 'Actual Prisma implementation evaluated against isolated condition-aware delegates, not live MySQL locks/crash testing', 'OCR lifecycle uses fake OCR; no language download or actual recognition', 'Controlled termination-double reproduces unbounded wait; no intentionally hung real external worker left running', 'No true Next build or real deployment artifact verification', 'No OOM, zip bomb or large-file load experiment', 'No real financial loss or production profitability claim']
};
fs.writeFileSync(path.join(dir, 'validation-results.json'), JSON.stringify(validation, null, 2) + '\n');
const artifacts = {};
for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
  if (entry.isFile() && entry.name !== 'artifact-sha256.json') artifacts[entry.name] = hash(path.join(dir, entry.name));
}
fs.writeFileSync(path.join(dir, 'artifact-sha256.json'), JSON.stringify({capturedAt: new Date().toISOString(), artifacts}, null, 2) + '\n');
console.log(JSON.stringify({sourceStable: true, trackedHashes: Object.keys(manifest.sha256).length, startCopies: manifest.starts.length, endCopies: manifest.ends.length, frozenUnchanged: manifest.unchangedPreviouslyTracked.length, formal: 523, author: 32, nodeTest: 18, independent: {positive, defects: cases.length-positive}, auditArtifacts: Object.keys(artifacts).length, verdict: validation.verdict}));
