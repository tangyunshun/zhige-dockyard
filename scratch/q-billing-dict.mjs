import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rec = await p.systemconfig.findUnique({ where: { key: 'billing_display_dict' } });
if (rec?.value) {
  const d = JSON.parse(rec.value);
  const values = d.values || {};
  console.log('values total:', Object.keys(values).length);
  for (const k of ['GIFT_BONUS','GIFT_REGISTER','CONSUME','RECHARGE','ESTIMATED_COMPATIBILITY']) console.log(k, '=', values[k] || values[k.toLowerCase()] || 'MISSING');
} else console.log('billing_display_dict MISSING');
await p.$disconnect();
