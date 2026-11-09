import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ passwordWrites: 0, consume: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: {
  findFirst: vi.fn(async () => ({ id: 'audit-user' })),
  update: vi.fn(async () => { h.passwordWrites++; return {}; }),
} } }));
vi.mock('@/lib/auth', () => ({ hashPassword: vi.fn(async () => 'HASH') }));
vi.mock('@/lib/sms-store', () => ({ consumeSmsCode: h.consume }));
vi.mock('@/lib/email-code-store', () => ({ consumeEmailCode: h.consume }));
vi.mock('@/lib/jwt-config', () => ({ getJwtSecretKey: () => new Uint8Array(32) }));
vi.mock('jose', () => ({ jwtVerify: vi.fn(async () => ({ payload: { email: 'audit@example.com', purpose: 'reset_password' } })) }));
import { POST } from '@/app/api/auth/reset-password/route';
beforeEach(() => { h.passwordWrites = 0; h.consume.mockReset(); });
describe('Current password-reset route, with all external IO replaced', () => {
  it('positive: valid reset credential and successful consumption updates password once', async () => {
    h.consume.mockResolvedValue({ ok: true });
    const r = await POST(new NextRequest('http://audit/reset', { method: 'POST', body: JSON.stringify({ resetToken: 'verified-fixture', newPassword: 'audit-password' }) }));
    expect(r.status).toBe(200); expect(h.passwordWrites).toBe(1);
  });
  it('DEFECT CHARACTERIZATION: already-consumed reset credential still updates password twice', async () => {
    h.consume.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, status: 400, error: 'already used' });
    const request = () => new NextRequest('http://audit/reset', { method: 'POST', body: JSON.stringify({ resetToken: 'same-verified-fixture', newPassword: 'audit-password' }) });
    const a = await POST(request()); const b = await POST(request());
    expect([a.status, b.status]).toEqual([200, 200]); expect(h.passwordWrites).toBe(2);
  });
  it('DEFECT CHARACTERIZATION: verification store unavailable still allows password write', async () => {
    h.consume.mockResolvedValue({ ok: false, status: 503, error: 'not ready' });
    const r = await POST(new NextRequest('http://audit/reset', { method: 'POST', body: JSON.stringify({ resetToken: 'verified-fixture', newPassword: 'audit-password' }) }));
    expect(r.status).toBe(200); expect(h.passwordWrites).toBe(1);
  });
});
