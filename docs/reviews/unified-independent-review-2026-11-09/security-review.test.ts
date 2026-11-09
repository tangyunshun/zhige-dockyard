import { it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ userReads: 0 }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: vi.fn(async () => { h.userReads++; return { id: 'u', role: 'SUPER_ADMIN', status: 'active' }; }) },
  apikey: { findMany: vi.fn(async () => [{ id: 'key', userId: 'disabled-user', keyHash: 'fake-hash', name: 'fixture' }]), update: vi.fn(async () => ({})) },
  operationlog: { create: vi.fn(async () => ({})) },
} }));
vi.mock('@/lib/auth', () => ({ validateUser: vi.fn(async () => ({ valid: false, error: 'FORCED_LOGOUT' })) }));
vi.mock('@/lib/ip-risk', () => ({ getClientIP: () => '127.0.0.1' }));
vi.mock('@/lib/jwt-config', () => ({ getJwtSecretKey: () => new Uint8Array(32) }));
vi.mock('jose', () => ({ jwtVerify: vi.fn(async () => ({ payload: { userId: 'u' } })) }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(async () => true) } }));
import { requirePlatformAuth } from '@/lib/security';
import { authenticateApiKey } from '@/lib/api-key-auth';
it('DEFECT: platform guard resurrects session rejected by full validation', async () => {
  const r = await requirePlatformAuth(new NextRequest('http://audit/admin', { headers: { cookie: 'auth_token=verified-expired-session-fixture' } }));
  expect(r.authorized).toBe(true);
});
it('DEFECT: valid API key returns owner without consulting disabled account state', async () => {
  h.userReads = 0;
  const r = await authenticateApiKey(new NextRequest('http://audit/open', { headers: { 'x-api-key': 'fixture-key' } }));
  expect(r?.userId).toBe('disabled-user'); expect(h.userReads).toBe(0);
});
