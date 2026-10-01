/** 【诊断】MagicAI 网关是否代理 deepseek-flash（密钥不打印；费用 <0.01 元） */
import { loadCliEnv } from "../scripts/cli-env";
loadCliEnv();
async function main() {
  const base = "https://jayce.sky1818.com/v1";
  const key = process.env.MODEL_API_KEY || "";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "回复两个字：正常" }],
      temperature: 0.5, max_tokens: 100, stream: false,
    }),
  });
  const text = await res.text();
  console.log("HTTP", res.status, "| 前 500 字符:", text.slice(0, 500).replace(/sk-[A-Za-z0-9]+/g, "sk-***"));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
