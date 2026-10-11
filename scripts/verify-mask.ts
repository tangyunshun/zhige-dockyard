/**
 * 验证问题1 的脱敏下发逻辑（与生产 GET 路由内联逻辑一致）：
 * 对每家已存密文的供应商，仅输出「前 6 + 后 4、中间固定掩码」的脱敏串，
 * 绝不打印完整明文。用于证明后台不会把密钥原文下发到浏览器。
 */
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto-secrets";

function maskSecret(s: string): string {
  if (s.length <= 10) return "••••••••" + s.slice(-2);
  return s.slice(0, 6) + "••••••••" + s.slice(-4);
}

async function main() {
  const rows = await prisma.modelprovider.findMany({ select: { name: true, apiKeyCipher: true } });
  for (const r of rows) {
    if (!r.apiKeyCipher) {
      console.log(`${r.name}\t| 无密文（仅环境变量）`);
      continue;
    }
    try {
      const plain = decryptSecret(r.apiKeyCipher);
      // 仅打印掩码串，不打印 plain
      console.log(`${r.name}\t| masked=${maskSecret(plain)}  (明文长度=${plain.length}，未输出)`);
    } catch {
      console.log(`${r.name}\t| 密文存在但解密失败（密钥不匹配，掩码置空）`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
