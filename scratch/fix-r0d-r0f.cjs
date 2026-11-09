// 临时脚本：r0d 交互式事务支持 + r0f 未配置契约更新
const fs = require("fs");

// 1) r0d fixture
const p1 = "src/app/api/__tests__/r0d-global-markup.test.ts";
let s = fs.readFileSync(p1, "utf8");
const oldTx = [
  "      $transaction: async (ops: any[]) => {",
  "        h.transactions++;",
  "        const before = { ...h };",
  "        try {",
  "          return await Promise.all(ops);",
  "        } catch (e) {",
  "          Object.assign(h, before);",
  "          throw e;",
  "        }",
  "      },",
].join("\r\n");
const newTx = [
  "      // [U09-6] 同时支持数组与交互式事务（审计在事务内用真实 count 构建）",
  "      $transaction: async (opsOrFn: any) => {",
  "        h.transactions++;",
  "        const before = { ...h };",
  "        try {",
  "          if (typeof opsOrFn === \"function\") {",
  "            const client = {",
  "              modelpricing: { updateMany: async (a: any) => prismaClient.modelpricing.updateMany(a) },",
  "              modelpricingperiod: { updateMany: async (a: any) => prismaClient.modelpricingperiod.updateMany(a) },",
  "              systemconfig: { upsert: async (a: any) => prismaClient.systemconfig.upsert(a) },",
  "              operationlog: { create: async (a: any) => prismaClient.operationlog.create(a) },",
  "            };",
  "            return await opsOrFn(client);",
  "          }",
  "          return await Promise.all(opsOrFn);",
  "        } catch (e) {",
  "          Object.assign(h, before);",
  "          throw e;",
  "        }",
  "      },",
].join("\r\n");
if (!s.includes(oldTx)) { console.log("tx anchor miss"); process.exit(1); }
s = s.replace(oldTx, newTx, 1);
// 提为 prismaClient 变量以供 tx 客户端引用
s = s.replace("vi.mock(\"@/lib/prisma\", () => {\r\n  const defer", "vi.mock(\"@/lib/prisma\", () => {\r\n  const defer");
s = s.replace("  return {\r\n    prisma: {", "  const prismaClient: any = {\r\n    prisma: {");
s = s.replace("        },\r\n      },\r\n    },\r\n  };\r\n});", "        },\r\n      },\r\n    },\r\n  };\r\n  return prismaClient;\r\n});");
fs.writeFileSync(p1, s);
console.log("r0d fixture updated");

// 2) r0f mailer 契约
const p2 = "src/app/api/__tests__/r0f-mailer.test.ts";
let m = fs.readFileSync(p2, "utf8");
const nl = m.includes("\r\n") ? "\r\n" : "\n";
const oldName = "it(\"传输器不可用（SMTP 未配置）归 unknown，不阻断主流程\", async () => {";
if (m.includes(oldName)) {
  m = m.replace(oldName, "it(\"传输器不可用（SMTP 未配置）= 确定未发起 failed（区别于已发起结果 unknown）\", async () => {");
  m = m.replace(/expect\(\(await sendMail\([^)]*\)\)\.outcome\)\.toBe\("unknown"\);/, 'expect((await sendMail({ to: "fixture@example.com", subject: "fixture", text: "x" } as any)).outcome).toBe("failed");');
  fs.writeFileSync(p2, m);
  console.log("r0f updated");
} else {
  console.log("r0f anchor miss");
}
