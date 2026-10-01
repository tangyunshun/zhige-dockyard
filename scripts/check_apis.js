const fs = require('fs');
const path = require('path');

const files = [
  'src/components/WorkspaceInternalLayoutV3.tsx',
  'src/components/studio/AssetsTab.tsx',
  'src/components/studio/KnowledgeTab.tsx',
  'src/contexts/AppContext.tsx'
];

for (const f of files) {
  const full = path.join(__dirname, '..', f);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  const matches = content.match(/\/api\/[a-zA-Z0-9_\-\/?=&]+/g) || [];
  const unique = Array.from(new Set(matches));
  console.log(`\n=== ${f} 中的 API 路径 ===`);
  unique.forEach(u => console.log('  ', u));
}
