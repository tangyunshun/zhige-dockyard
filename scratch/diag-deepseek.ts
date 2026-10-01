/** 【诊断】直接调用 DeepSeek 端点验证（密钥不打印；费用 <0.01 元，授权内） */
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
loadCliEnv();
async function main() {
  const p = await prisma.modelprovider.findFirst({ where: { name: "DeepSeek" }, select: { baseUrl: true, protocol: true } });
  const d = await prisma.modeldeployment.findFirst({ where: { modelId: "deepseek-flash" }, select: { upstreamModel: true, modelId: true } });
  console.log("baseUrl:", p?.baseUrl, "| protocol:", p?.protocol, "| upstreamModel:", d?.upstreamModel);
  const key = process.env.MODEL_API_KEY || "";
  console.log("MODEL_API_KEY 长度:", key.length);
  const res = await fetch(`${p!.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: d!.upstreamModel,
      messages: [{ role: "user", content: "回复两个字：正常" }],
      temperature: 0.5,
      max_tokens: 2000,
      stream: false,
    }),
  });
  const text = await res.text();
  console.log("HTTP", res.status, "| 响应前 400 字符:", text.slice(0, 400).replace(/sk-[A-Za-z0-9]+/g, "sk-***"));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
