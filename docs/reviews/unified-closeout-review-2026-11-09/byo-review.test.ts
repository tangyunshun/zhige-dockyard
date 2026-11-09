import { it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ sent: null as any }));

vi.mock("@/lib/auth", () => ({
  validateUser: vi.fn(async () => ({ valid: true, user: { id: "owner", role: "USER" } })),
  isAdminRole: () => false,
}));
vi.mock("@/lib/security", () => ({
  requireWorkspaceMembership: vi.fn(async () => true),
  getLogicalWorkspaceRole: vi.fn(async () => "OWNER"),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workspace_byo_model: {
      findUnique: vi.fn(async () => ({
        baseUrl: "https://original.example/Private/V1",
        protocol: "OPENAI_COMPATIBLE",
        apiKeyCipher: "fixture-cipher",
      })),
    },
  },
}));
vi.mock("@/lib/crypto-secrets", () => ({ decryptSecret: () => "FAKE-SAVED-KEY" }));
vi.mock("@/lib/workspace-byo-model", () => ({
  testByoModelConnection: vi.fn(async (input: any) => { h.sent = input; return { ok: true, sampleReply: "fixture" }; }),
  deriveSuggestedCapabilities: () => [],
}));

import { POST } from "@/app/api/workspace/byo-model/test/route";

const post = (body: any) =>
  POST(new NextRequest("http://audit/test?workspaceId=w", { method: "POST", body: JSON.stringify(body) }));

it("不同 host 不复用旧 key", async () => {
  await post({ baseUrl: "https://changed.example/v1", apiKey: "" });
  expect(h.sent.apiKey).toBe("");
});

it("完全相同 endpoint+协议可复用旧 key", async () => {
  await post({ baseUrl: "https://original.example/Private/V1", apiKey: "" });
  expect(h.sent.apiKey).toBe("FAKE-SAVED-KEY");
});

it("路径大小写不同是新目的地，不复用旧 key", async () => {
  await post({ baseUrl: "https://original.example/private/v1", apiKey: "" });
  expect(h.sent.baseUrl).toBe("https://original.example/private/v1");
  expect(h.sent.apiKey).toBe("");
});

it("HTTPS 改 HTTP 协议降级是新目的地，不复用旧 key", async () => {
  await post({ baseUrl: "http://original.example/Private/V1", apiKey: "" });
  expect(h.sent.baseUrl).toBe("http://original.example/Private/V1");
  expect(h.sent.apiKey).toBe("");
});

it('DEFECT: query change is discarded when choosing whether to reuse saved key',async()=>{
 await POST(new NextRequest('http://audit/test?workspaceId=w',{method:'POST',body:JSON.stringify({baseUrl:'https://original.example/Private/V1?tenant=other',apiKey:''})}));
 expect(h.sent).toMatchObject({baseUrl:'https://original.example/Private/V1?tenant=other',apiKey:'FAKE-SAVED-KEY'});
});