/** 【诊断】网关延迟测试（小请求，费用 <0.01 元） */
import { loadCliEnv } from "../scripts/cli-env";
loadCliEnv();
async function main() {
  const key = process.env.MODEL_API_KEY || "";
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch("https://jayce.sky1818.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "gpt-5.5", messages: [{ role: "user", content: "回复两个字：正常" }], temperature: 0.5, max_tokens: 100, stream: false }),
      signal: controller.signal,
    });
    const text = await res.text();
    console.log("HTTP", res.status, "| 耗时", Date.now() - started, "ms | 前 300 字符:", text.slice(0, 300).replace(/sk-[A-Za-z0-9]+/g, "sk-***"));
  } catch (e: any) {
    console.log("失败 耗时", Date.now() - started, "ms |", e?.message);
  } finally { clearTimeout(timer); }
}
main().catch((e) => console.error(e.message));
