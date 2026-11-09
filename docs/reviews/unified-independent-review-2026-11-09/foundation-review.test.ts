import { it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ quotaWrites: 0, adminInserts: 0 }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  membershiplevel: {
    findUnique: vi.fn(async () => ({ id: 'FREE', tokenLimit: BigInt(500) })),
    update: vi.fn(async ({data}: any) => { h.quotaWrites++; return { id: 'FREE', ...data }; }),
  },
  user: { count: vi.fn(async () => 0), findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => ({ id: 'fixture-admin', role: 'SUPER_ADMIN' })) },
  $executeRaw: vi.fn(async () => { h.adminInserts++; return 1; }),
  workspacequota: { findMany: vi.fn(async () => [{ workspaceId: 'OTHER', tokenBalance: '100' }]) },
  workspacemember: { findMany: vi.fn(async () => [{ user: { id: 'other-user', email: 'fixture@example.com' } }]) },
} }));
vi.mock('@/lib/auth', () => ({ hashPassword: vi.fn(async () => 'fake-hash'), validatePasswordStrength: vi.fn(() => ({ valid: true })) }));
import { getMembershipTokenLimit } from '@/lib/quota-token';
import { POST as init } from '@/app/api/auth/init-admin/route';
import { GET as debug } from '@/app/api/health/debug-test01/route';
beforeEach(() => { h.quotaWrites = 0; h.adminInserts = 0; });
it('DEFECT: reading FREE quota overwrites configured 500 with 100', async () => {
  expect(await getMembershipTokenLimit('FREE')).toBe(BigInt(100)); expect(h.quotaWrites).toBe(1);
});
it('DEFECT: two initializations with no setup credential both reach administrator insert', async () => {
  const req = (email: string) => new NextRequest('http://audit/api/auth/init-admin', { method: 'POST', body: JSON.stringify({name:'fixture', email, password:'fixture-password'}) });
  const r = await Promise.all([init(req('a@example.com')), init(req('b@example.com'))]);
  expect(r.map(x => x.status)).toEqual([200,200]); expect(h.adminInserts).toBe(2);
});
it('DEFECT: public health debug route returns member material without any identity check', async () => {
  const r = await debug(); const body = await r.json();
  expect(r.status).toBe(200); expect(body.enterpriseMembers[0].user.email).toBe('fixture@example.com');
});
