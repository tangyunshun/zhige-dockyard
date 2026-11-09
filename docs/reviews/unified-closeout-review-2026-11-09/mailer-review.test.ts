import { it, expect, vi, beforeEach } from "vitest";
const h = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemconfig: {
      findMany: vi.fn(async () => [
        { key: "smtpHost", value: "smtp.fixture.invalid" },
        { key: "senderEmail", value: "fixture@example.com" },
      ]),
    },
  },
}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: h.send }) } }));

import { sendMail, __resetMailerTransportForTest } from "@/lib/mailer";
import { prisma as prismaMock } from "@/lib/prisma";

beforeEach(() => {
  h.send.mockReset();
  __resetMailerTransportForTest();
  vi.mocked(prismaMock.systemconfig.findMany).mockResolvedValue([
    { key: "smtpHost", value: "smtp.fixture.invalid" },
    { key: "senderEmail", value: "fixture@example.com" },
  ] as any);
});

it("传输器不可用（SMTP 未配置）归 unknown，不阻断主流程", async () => {
  vi.mocked(prismaMock.systemconfig.findMany).mockResolvedValue([]); // smtpHost 缺失 → getTransport 返回 null
  expect((await sendMail({ to: "fixture@example.com", subject: "fixture", text: "fixture" })).outcome).toBe("unknown");
});

it("传输明确拒收目标 → failed", async () => {
  h.send.mockResolvedValue({ accepted: [], rejected: ["fixture@example.com"] });
  expect(await sendMail({ to: "fixture@example.com", subject: "fixture", text: "fixture" })).toMatchObject({
    ok: false,
    outcome: "failed",
  });
});

it("传输返回结果但本收件人未在 accepted（空 accepted、未拒收）→ unknown，不宣称已发送", async () => {
  h.send.mockResolvedValue({ accepted: [], rejected: [] });
  expect(await sendMail({ to: "fixture@example.com", subject: "fixture", text: "fixture" })).toMatchObject({
    ok: false,
    outcome: "unknown",
  });
});

it("目标确在 accepted → accepted", async () => {
  h.send.mockResolvedValue({ accepted: ["fixture@example.com"], rejected: [] });
  expect((await sendMail({ to: "fixture@example.com", subject: "fixture", text: "fixture" })).outcome).toBe("accepted");
});

it('DEFECT: unrelated mailbox suffix is mistaken for accepted target',async()=>{
 h.send.mockResolvedValue({accepted:['malice@example.com'],rejected:[]});
 expect(await sendMail({to:'alice@example.com',subject:'fixture',text:'fixture'})).toMatchObject({ok:true,outcome:'accepted'});
});
it('DEFECT: missing recipient confirmation fields still becomes accepted',async()=>{
 h.send.mockResolvedValue({});expect(await sendMail({to:'fixture@example.com',subject:'fixture',text:'fixture'})).toMatchObject({ok:true,outcome:'accepted'});
});