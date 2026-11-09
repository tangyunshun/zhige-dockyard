// Offline source inventory. Does not import application code or connect to a database.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const cp = require('node:child_process');
const root = process.cwd();
const out = path.join(root, 'docs/code-facts-2026-11-05');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, '');
const lineAt = (s, p) => s.slice(0, p).split('\n').length;
const link = (p, n = 1) => `[${p}:${n}](../../${p}#L${n})`;
const escape = s => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const schema = read('prisma/schema.prisma');
const blocks = [...schema.matchAll(/^(model|enum)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
const names = new Set(blocks.filter(m => m[1] === 'model').map(m => m[2]));
const models = blocks.filter(m => m[1] === 'model').map(m => {
  const fields = [];
  const constraints = [];
  for (const row of m[3].split('\n')) {
    const clean = row.replace(/\/\/.*$/, '').trim();
    if (!clean) continue;
    if (clean.startsWith('@@')) { constraints.push(clean); continue; }
    const f = clean.match(/^(\w+)\s+(\w+)(\?|\[\])?\s*(.*)$/);
    if (f) fields.push({ name: f[1], type: f[2], suffix: f[3] || '', attributes: f[4], relation: names.has(f[2]) });
  }
  return { name: m[2], table: m[3].match(/@@map\("([^"]+)"\)/)?.[1] || m[2], line: lineAt(schema, m.index), fields, constraints };
});
const edges = [];
for (const m of models) for (const f of m.fields) {
  if (!f.relation || !f.attributes.includes('fields:')) continue;
  const local = f.attributes.match(/fields:\s*\[([^\]]+)\]/)?.[1];
  const ref = f.attributes.match(/references:\s*\[([^\]]+)\]/)?.[1];
  const localField = m.fields.find(x => x.name === local);
  const unique = localField?.attributes.includes('@unique') || m.constraints.some(x => x.startsWith('@@unique([' + local + ']'));
  edges.push({ child: m.name, parent: f.type, field: local, ref, optional: f.suffix === '?', unique, delete: f.attributes.match(/onDelete:\s*(\w+)/)?.[1] || '未显式指定（由 Prisma 默认规则决定）' });
}
const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : [d + '/' + e.name]);
const routes = [];
const guards = /validateUser|validateAdmin|withAuth|checkAuth|requirePlatform|requireSystemSettings|requirePermissionGrant|requireWorkspace|requireStepUp|verifyStepUp|authenticateApiKey|assertCSRF|jwtVerify|CRON_SECRET|x-user-id|isAdminRole|isAdmin\(|isSuperAdmin|verifyNotify|checkOpenApiRateLimit/;
for (const file of walk('src/app/api').filter(p => /\/route\.ts$/.test(p))) {
  const s = read(file);
  const ast = ts.createSourceFile(file, s, ts.ScriptTarget.Latest, true);
  const methods = [];
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(node.name?.text)) methods.push(node.name.text);
    if (ts.isVariableStatement(node) && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) for (const d of node.declarationList.declarations) if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(d.name.getText(ast))) methods.push(d.name.getText(ast));
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) for (const e of node.exportClause.elements) if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(e.name.text)) methods.push(e.name.text);
  }
  const hits = s.split('\n').flatMap((l, i) => !l.trim().startsWith('//') && guards.test(l) ? [{ line: i + 1, text: l.trim() }] : []);
  const route = '/api/' + file.replace(/^src\/app\/api\//, '').replace(/\/route\.ts$/, '').replace(/\([^/]+\)\//g, '');
  routes.push({ route, file, methods: [...new Set(methods)], hits });
}
routes.sort((a, b) => a.route.localeCompare(b.route));
const publicSection = read('src/middleware.ts').split('const PUBLIC_PREFIXES = [')[1].split('];')[0];
const prefixes = [...publicSection.matchAll(/^\s*"([^"]+)"/gm)].map(m => m[1]);
for (const r of routes) r.middleware = ['/api/auth/me', '/api/auth/touch'].includes(r.route) ? 'JWT 预检' : prefixes.some(p => r.route === p || r.route.startsWith(p + '/')) ? '放行，路由自行鉴权' : r.route === '/api/studio' ? 'catalog action 放行；其余 JWT 预检' : r.route.startsWith('/api/admin/') ? 'JWT + 已启用最长前缀权限规则' : 'JWT 预检';
let db = '# Entity 结构证据附录\n\n来源仅为 `prisma/schema.prisma`。这是代码声明，不是已部署数据库 DDL；未运行迁移或查询真实库。`?` 可空，`[]` 反向关系集合不落列。所有标量字段、默认值、映射与索引见下。\n\n';
db += `共 ${models.length} 个 model、${edges.length} 条拥有外键字段的显式关系、${blocks.filter(b => b[1] === 'enum').length} 个 enum。\n\n## 全量显式关系 ER 图\n\n图中仅包含 Entity 声明的关系；未声明关系的 ID 绝不伪造为外键。\n\n\`\`\`mermaid\nerDiagram\n`;
for (const m of models) db += `  ${m.name}\n`;
for (const e of edges) db += `  ${e.parent} ${e.optional ? '|o' : '||'}--${e.unique ? 'o|' : 'o{'} ${e.child} : "${e.field} to ${e.ref}"\n`;
db += '```\n\n## 外键与删除策略\n\n| 子表 | 父表 | 字段 → 引用 | 可空 | 唯一 | onDelete |\n|---|---|---|---|---|---|\n';
for (const e of edges) db += `| ${e.child} | ${e.parent} | ${e.field} → ${e.ref} | ${e.optional} | ${e.unique} | ${e.delete} |\n`;
for (const m of models) {
  db += `\n## ${m.name} → ${m.table}\n\n${link('prisma/schema.prisma', m.line)}\n\n| 字段 | 类型 | 种类 | 属性 |\n|---|---|---|---|\n`;
  for (const f of m.fields) db += `| ${f.name} | ${f.type}${f.suffix} | ${f.relation ? '关系（非独立列）' : '标量列'} | ${escape(f.attributes)} |\n`;
  db += '\n```prisma\n' + m.constraints.join('\n') + '\n```\n';
}
db += '\n## 枚举\n\n```prisma\n' + blocks.filter(m => m[1] === 'enum').map(m => m[0]).join('\n\n') + '\n```\n';
fs.writeFileSync(path.join(out, 'entities.md'), db);
let api = '# API 路由与鉴权证据附录\n\n通过 TypeScript AST 读取 HTTP 导出（含 studio re-export），不将注释中的接口当路由。守卫列是**同一文件级线索**，包括 import 与 helper，不能据此断言每个方法都执行该守卫。具体权限值与分支以链接源码及主报告为准；无守卫命中不等于匿名可用。动态数据库规则/授权未读取。\n\n';
api += `共 ${routes.length} 个 route.ts，${routes.reduce((a, r) => a + r.methods.length, 0)} 个显式 HTTP 导出。Next 隐式 HEAD/OPTIONS 未计入。\n\n| 路径 | 方法 | 中间件 | 路由源码与文件内鉴权线索 |\n|---|---|---|---|\n`;
for (const r of routes) api += `| \`${r.route}\` | ${r.methods.join(', ')} | ${r.middleware} | ${link(r.file)}${r.hits.length ? '<br>' + r.hits.map(h => `${link(r.file, h.line)} ${escape(h.text).replace(/`/g, "'")}`).join('<br>') : '；未命中列出的鉴权符号，需检查 helper/中间件'} |\n`;
api += '\n## Studio action 分发（不能仅按 URL 审计）\n\n';
const studio = read('src/app/api/studio/handler.ts');
for (const [i, l] of studio.split('\n').entries()) if (/if \(action ===/.test(l)) api += `- ${link('src/app/api/studio/handler.ts', i + 1)}：\`${l.trim()}\`\n`;
fs.writeFileSync(path.join(out, 'routes.md'), api);
const tracked = ['package.json', 'prisma/schema.prisma', 'src/middleware.ts', ...['src/app/api', 'src/lib', 'src/constants'].flatMap(walk).filter(p => p.endsWith('.ts') && !p.includes('__tests__') && !p.endsWith('.test.ts'))];
const manifest = { capturedAt: new Date().toISOString(), head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: cp.execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), counts: { models: models.length, relations: edges.length, routes: routes.length, methods: routes.reduce((a, r) => a + r.methods.length, 0) }, sha256: Object.fromEntries(tracked.map(p => [p, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex')])) };
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ ...manifest, models, edges, routes }, null, 2));
let constants = '# 数值常量定位附录\n\n范围：src/lib、src/constants 与 API 下的 TypeScript，排除测试。AST 提取名称为全大写且初始化表达式含数值字面量的变量（含函数内常量）。仅定位，不代表运行期生效；长表达式截断，完整内容见源码。小写变量、分支内魔数、种子数据和 UI 文案不属于此机械清单，关键例外由主报告补充。未读取环境变量值。\n\n| 名称 | 初始化表达式 | 源码 |\n|---|---|---|\n';
for (const file of [...walk('src/lib'), ...walk('src/constants'), ...walk('src/app/api')].filter(p => p.endsWith('.ts') && !p.includes('__tests__') && !p.endsWith('.test.ts'))) {
  const s = read(file);
  const ast = ts.createSourceFile(file, s, ts.ScriptTarget.Latest, true);
  function visit(n) {
    if (ts.isVariableDeclaration(n) && /^[A-Z][A-Z0-9_]+$/.test(n.name.getText(ast)) && n.initializer) {
      let numeric = false;
      function hasNumber(c) { if (ts.isNumericLiteral(c) || c.kind === ts.SyntaxKind.BigIntLiteral) numeric = true; ts.forEachChild(c, hasNumber); }
      hasNumber(n.initializer);
      if (numeric) constants += `| ${n.name.getText(ast)} | ${escape(n.initializer.getText(ast).slice(0, 500)).replace(/`/g, "'")} | ${link(file, ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1)} |\n`;
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
fs.writeFileSync(path.join(out, 'constants.md'), constants);
console.log(JSON.stringify({ head: manifest.head, ...manifest.counts, filesHashed: tracked.length }));
