/**
 * 只读：穷举 operationlog.details（JSON）中真实出现过的所有字段键。
 * 目的：确认「操作附带信息」中文词典是否覆盖数据库里全部真实键，避免继续靠猜漏翻英文。
 *
 * 用法：
 *   npx tsx scripts/enum-op-log-metadata-keys.ts
 */
import { PrismaClient } from "@prisma/client";

type KeyStat = { count: number; samples: string[] };

function parseDetails(d: unknown): Record<string, any> | null {
  if (!d) return null;
  if (typeof d === "string") {
    try {
      return JSON.parse(d);
    } catch {
      return null;
    }
  }
  if (typeof d === "object") return d as Record<string, any>;
  return null;
}

function shortSample(v: unknown): string {
  let s: string;
  try {
    s = typeof v === "object" ? JSON.stringify(v) : String(v);
  } catch {
    s = String(v);
  }
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

async function main() {
  const prisma = new PrismaClient();
  const total = await prisma.operationlog.count();
  console.log(`operationlog 总记录数: ${total}`);

  const keyStats = new Map<string, KeyStat>();
  const actionStats = new Map<string, number>();

  const BATCH = 5000;
  let skip = 0;
  let scanned = 0;

  while (scanned < total) {
    const rows = await prisma.operationlog.findMany({
      select: { action: true, details: true },
      skip,
      take: BATCH,
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (row.action) {
        actionStats.set(row.action, (actionStats.get(row.action) ?? 0) + 1);
      }
      const obj = parseDetails(row.details);
      if (obj && typeof obj === "object") {
        for (const k of Object.keys(obj)) {
          const stat = keyStats.get(k) ?? { count: 0, samples: [] };
          stat.count += 1;
          if (stat.samples.length < 3) stat.samples.push(shortSample(obj[k]));
          keyStats.set(k, stat);
        }
      }
    }

    scanned += rows.length;
    skip += BATCH;
    if (scanned % 20000 === 0) {
      console.log(`  已扫描 ${scanned}/${total} …`);
    }
  }

  console.log("\n===== operationlog.details 真实字段键（按出现次数降序）=====");
  const sortedKeys = [...keyStats.entries()].sort((a, b) => b[1].count - a[1].count);

  // 直接读取 page.tsx 里的 FIELD_TRANSLATIONS 真实键集合，复刻 formatMetadataKey 兜底规则，
  // 找出“仍会露英文”的键（以真实代码为准，不做手工近似）
  const fs = await import("fs");
  const path = await import("path");
  const pageSrc = fs.readFileSync(
    path.resolve(process.cwd(), "src/app/user/activities/page.tsx"),
    "utf-8",
  );
  const blockMatch = pageSrc.match(
    /const FIELD_TRANSLATIONS:\s*Record<string,\s*string>\s*=\s*\{([\s\S]*?)\n\};/,
  );
  const EXACT = new Set<string>();
  if (blockMatch) {
    const re = /^\s*([A-Za-z_][A-Za-z0-9_]*):\s*"/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(blockMatch[1]))) EXACT.add(m[1]);
  }
  const isCovered = (k: string): boolean => {
    const lower = k.toLowerCase();
    if (EXACT.has(k)) return true;
    if (lower.includes("price")) return true;
    if (lower.includes("point")) return true;
    if (lower.includes("token")) return true;
    if (lower.includes("balance")) return true;
    if (lower.includes("active") || lower.includes("enable")) return true;
    if (lower.includes("popular") || lower.includes("recommend")) return true;
    if (lower.includes("sort") || lower.includes("order")) return true;
    if (lower.includes("color")) return true;
    if (lower.includes("icon")) return true;
    if (lower.includes("expire") || lower.includes("due")) return true;
    if (lower.includes("limit") || lower.includes("quota")) return true;
    if (lower.includes("channel") || lower.includes("pay")) return true;
    if (lower.includes("position")) return true;
    if (lower.includes("workspace")) return true;
    if (lower.includes("component")) return true;
    if (lower.includes("model")) return true;
    if (lower.includes("name")) return true;
    if (lower.includes("id")) return true;
    if (lower.includes("time") || lower.includes("date")) return true;
    if (lower.includes("user")) return true;
    if (lower.includes("role")) return true;
    if (lower.includes("status") || lower.includes("state")) return true;
    if (lower.includes("desc") || lower.includes("msg")) return true;
    if (lower.includes("count") || lower.includes("num") || lower.includes("qty")) return true;
    return false;
  };

  const uncovered: Array<[string, number]> = [];
  for (const [k, stat] of sortedKeys) {
    console.log(`  ${k}  (${stat.count}次)  示例: ${stat.samples.join(" | ")}`);
    if (!isCovered(k)) uncovered.push([k, stat.count]);
  }
  console.log(`\n共计 ${sortedKeys.length} 个不同字段键`);

  console.log("\n===== 仍会露英文（当前词典/兜底未覆盖）的键 =====");
  if (uncovered.length === 0) {
    console.log("  （无）—— 现有中文词典已覆盖数据库里全部真实字段键");
  } else {
    for (const [k, c] of uncovered.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k}  (${c}次)`);
    }
  }
  console.log(`\n未覆盖 ${uncovered.length} 个键`);

  console.log("\n===== 不同 action 值（供映射参考）=====");
  const sortedActions = [...actionStats.entries()].sort((a, b) => b[1] - a[1]);
  for (const [a, c] of sortedActions) {
    console.log(`  ${a}  (${c}次)`);
  }
  console.log(`\n共计 ${sortedActions.length} 个不同 action`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
