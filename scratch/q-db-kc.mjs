import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rec = await p.systemconfig.findUnique({ where: { key: 'audit_action_dict' } });
const d = JSON.parse(rec.value);
console.log('KC actions in DB:', ['KNOWLEDGE_CATEGORY_CREATE','KNOWLEDGE_CATEGORY_DELETE','KNOWLEDGE_CATEGORY_RENAME','KNOWLEDGE_CATEGORY_BATCH_DELETE'].map(k => k + '=' + (d[k] || 'MISSING')).join(', '));
const disp = await p.systemconfig.findUnique({ where: { key: 'audit_display_dict' } });
const words = JSON.parse(disp.value).words || {};
console.log('words in DB:', ['category','rename','restore'].map(k => k + '=' + (words[k] || 'MISSING')).join(', '));
await p.$disconnect();
