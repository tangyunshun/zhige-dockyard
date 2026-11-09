import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rec = await p.systemconfig.findUnique({ where: { key: 'audit_display_dict' } });
const d = JSON.parse(rec.value);
d.words = { ...d.words, rename: '重命名', restore: '恢复' };
await p.systemconfig.update({ where: { key: 'audit_display_dict' }, data: { value: JSON.stringify(d) } });
console.log('words patched: rename/restore added, total', Object.keys(d.words).length);
await p.$disconnect();
