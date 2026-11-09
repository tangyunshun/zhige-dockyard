import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rec = await p.systemconfig.findUnique({ where: { key: 'billing_display_dict' } });
const d = JSON.parse(rec.value);
d.values = { ...d.values, GIFT_BONUS: '岗位共享奖励', ESTIMATED_COMPATIBILITY: '固定点数扣费（估算兼容模式）' };
await p.systemconfig.update({ where: { key: 'billing_display_dict' }, data: { value: JSON.stringify(d) } });
console.log('values patched, total', Object.keys(d.values).length);
await p.$disconnect();
