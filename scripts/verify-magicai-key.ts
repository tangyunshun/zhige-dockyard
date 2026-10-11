import { readFileSync } from "fs";
import { resolve } from "path";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secrets";

function readEnvValue(key: string): string | null {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      if (t.slice(0, eq).trim() !== key) continue;
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return v || null;
    }
  } catch {}
  return process.env[key] ?? null;
}

async function main() {
  const env = readEnvValue("MODEL_API_KEY");
  const row = await prisma.modelprovider.findFirst({ where: { name: "MagicAI" }, select: { apiKeyCipher: true } });
  if (!env || !row?.apiKeyCipher) {
    console.log("MISSING", { envLen: env?.length ?? 0, cipher: !!row?.apiKeyCipher });
    process.exit(1);
  }
  const decrypted = decryptSecret(row.apiKeyCipher);
  const match = decrypted === env;
  console.log(JSON.stringify({ envLen: env.length, cipherLen: row.apiKeyCipher.length, decryptedLen: decrypted.length, exactMatch: match }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
