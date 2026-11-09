import { it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ userReads: 0 }));
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: vi.fn(async () => { h.userReads++; return { id: 'disabled-user', role: 'USER', status: 'banned' }; }) },
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
it('POSITIVE: platform guard does NOT resurrect a session rejected by full validation', async () => {
  const r = await requirePlatformAuth(new NextRequest('http://audit/admin', { headers: { cookie: 'auth_token=verified-expired-session-fixture' } }));
  expect(r.authorized).toBe(false);
});
it('POSITIVE: API key whose owner account is disabled is rejected, and account state is consulted', async () => {
  h.userReads = 0;
  const r = await authenticateApiKey(new NextRequest('http://audit/open', { headers: { 'x-api-key': 'fixture-key' } }));
  expect(r).toBeNull();
  expect(h.userReads).toBeGreaterThan(0);
});
