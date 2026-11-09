import { it, expect, vi, beforeEach } from 'vitest';
const h = vi.hoisted(() => ({ codes: [] as any[], budgets: new Map<string, any>() }));
vi.mock('@/lib/prisma', () => {
  const verificationBudget = {
    upsert: vi.fn(async ({where,create,update}: any) => {
      let row = h.budgets.get(where.id);
      if(row) row.count += update.count.increment;
      else { row = {...create}; h.budgets.set(where.id,row); }
      return {...row};
    }),
    update: vi.fn(async ({where,data}: any) => {
      const row = h.budgets.get(where.id); if(!row) throw new Error('missing');
      if(typeof data.count === 'number') row.count = data.count;
      else row.count += data.count?.increment ?? -(data.count?.decrement ?? 0);
      if(data.windowStart != null) row.windowStart = data.windowStart;
      return {...row};
    }),
    findUnique: vi.fn(async ({where}: any) => h.budgets.get(where.id) ?? null),
  };
  return { prisma: { verificationBudget,
    smscode: {
      findFirst: vi.fn(async ({where}: any) => [...h.codes].reverse().find(r => Object.entries(where).every(([k,v]) => r[k] === v)) ?? null),
      create: vi.fn(async ({data}: any) => { const row = {...data,createdAt:new Date()}; h.codes.push(row); return row; }),
      updateMany: vi.fn(async ({where,data}: any) => { let count=0; for(const row of h.codes) if(Object.entries(where).every(([k,v])=>row[k]===v)) { Object.assign(row,data); count++; } return {count}; }),
    },
  } };
});
import { prisma } from '@/lib/prisma';
import { getVerificationBackend, __setVerificationBackendForTest } from '@/lib/verification-backend';
import { storeVerificationCode, verifyVerificationCode } from '@/lib/verification-codes';
beforeEach(() => { h.codes=[]; h.budgets.clear(); __setVerificationBackendForTest(null); delete (prisma as any).verificationbudget; });
it('DEFECT: generated-client spelling verificationBudget exists but production backend incorrectly uses verificationbudget', async () => {
  expect((prisma as any).verificationBudget).toBeDefined();
  expect(await getVerificationBackend().ready()).toBe(true);
  expect((await storeVerificationCode('email','fixture@example.com','register','123456')).status).toBe(503);
});
it('DEFECT BEHIND WIRING: even after adding missing delegate alias, immediate resend bypasses 60 second interval', async () => {
  (prisma as any).verificationbudget=(prisma as any).verificationBudget;
  const a=await storeVerificationCode('email','fixture@example.com','register','123456');
  const b=await storeVerificationCode('email','fixture@example.com','register','654321');
  expect([a.ok,b.ok]).toEqual([true,true]);
});
it('DEFECT BEHIND WIRING: production failure recorder is a no-op and five failures never lock correct verification', async () => {
  (prisma as any).verificationbudget=(prisma as any).verificationBudget;
  await storeVerificationCode('email','fixture@example.com','register','123456');
  for(let i=0;i<5;i++) await verifyVerificationCode('email','fixture@example.com','register','wrong');
  expect((await verifyVerificationCode('email','fixture@example.com','register','123456')).valid).toBe(true);
});
