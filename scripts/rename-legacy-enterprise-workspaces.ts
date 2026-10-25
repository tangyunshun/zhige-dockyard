// 一次性迁移：把「沿用了个人空间名」的企业空间改名为「企业空间-<用户名>」。
// 只处理名称以「个人空间」开头的企业空间（升级时错误继承个人名的那批），不碰用户自定义名称，避免误改。
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const p = resolve(process.cwd(), ".env");
    const txt = readFileSync(p, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
}
loadEnv();

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const { generateEnterpriseWorkspaceName } = await import("../src/lib/workspace-naming");

  const targets = await prisma.workspace.findMany({
    where: { type: "ENTERPRISE", name: { startsWith: "个人空间" } },
    select: { id: true, name: true, ownerId: true },
  });
  console.log(`发现 ${targets.length} 个「沿用了个人空间名」的企业空间待改名`);
  for (const w of targets) {
    const owner = await prisma.user.findUnique({ where: { id: w.ownerId }, select: { name: true } });
    const newName = await generateEnterpriseWorkspaceName(w.ownerId, owner?.name);
    await prisma.workspace.update({ where: { id: w.id }, data: { name: newName, updatedAt: new Date() } });
    console.log(`  ${w.id}: 「${w.name}」 → 「${newName}」`);
  }
  console.log("完成。");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("改名失败:", e);
    process.exit(1);
  });
