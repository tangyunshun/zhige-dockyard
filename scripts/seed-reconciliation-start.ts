/**
 * 每日对账启动种子：记录价格凭证确认 + 设定对账起点（Day 1）。
 * - pricing.priceVoucherNote：智谱三模型价格经负责人确认无误（批次 KEY-TO-PAGE 第四件）
 * - reconciliation.startDate：对账观察起点（2026-10-11 为第 1 天），后台据此显示「第 X 天 / 7 天」
 */
import { prisma } from "@/lib/prisma";

async function upsert(key: string, value: string) {
  await prisma.systemconfig.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  console.log(`OK ${key} = ${value}`);
}

async function main() {
  await upsert("pricing.priceVoucherNote", "智谱三模型价格经负责人 2026-10-11 确认无误");
  await upsert("reconciliation.startDate", "2026-10-11");
  console.log("完成。");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
