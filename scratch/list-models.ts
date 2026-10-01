/** 【诊断】列 MagicAI 网关可用模型（只读，零费用） */
import { loadCliEnv } from "../scripts/cli-env";
loadCliEnv();
async function main() {
  const key = process.env.MODEL_API_KEY || "";
  const res = await fetch("https://jayce.sky1818.com/v1/models", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    const ids = (j?.data ?? []).map((m: any) => m.id);
    console.log("HTTP", res.status, "模型数:", ids.length);
    console.log(JSON.stringify(ids));
  } catch { console.log("HTTP", res.status, text.slice(0, 300)); }
}
main().catch((e) => console.error(e.message));
