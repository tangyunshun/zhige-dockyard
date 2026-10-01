/**
 * 把数据库中的权限目录导出为「仓库快照」，供 CI / 无数据库环境使用。
 * 用法：npm run catalog:snapshot
 *
 * 背景：权限目录的权威来源是数据库（systemconfig.PLATFORM_PERMISSION_CATALOG_V1），
 *      会随后台「注册新功能模块」持续增长；而代码里的 INITIAL_PERMISSIONS_CATALOG 只是冷启动种子。
 *      CI 无数据库，因此需要一份随仓库版本化的快照，保证权限接线自检结果准确。
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const CONFIG_KEY = "PLATFORM_PERMISSION_CATALOG_V1";
const OUT_DIR = path.join(ROOT, "scripts", "data");
const OUT_FILE = path.join(OUT_DIR, "permission-catalog.snapshot.json");

(async () => {
  const prisma = new PrismaClient();
  try {
    const row = await prisma.systemconfig.findUnique({ where: { key: CONFIG_KEY } });
    if (!row?.value) {
      console.error("!! 数据库中不存在权限目录，无法导出");
      process.exitCode = 1;
      return;
    }

    const groups = JSON.parse(row.value);
    if (!Array.isArray(groups)) {
      console.error("!! 权限目录结构异常（应为数组）");
      process.exitCode = 1;
      return;
    }

    const keyCount = groups.reduce((n: number, g: any) => n + (g?.keys?.length ?? 0), 0);

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(groups, null, 2), "utf8");

    console.log(`✅ 已导出权限目录快照：${path.relative(ROOT, OUT_FILE)}`);
    console.log(`   模块数 ${groups.length}，权限点 ${keyCount}`);

    // 同步导出「接口权限规则层」快照，让 CI 自检也能识别规则层接线的权限点
    const rulesRow = await prisma.systemconfig.findUnique({
      where: { key: "PLATFORM_API_PERMISSION_RULES_V1" },
    });
    const RULES_OUT = path.join(OUT_DIR, "api-permission-rules.snapshot.json");
    if (rulesRow?.value) {
      const rules = JSON.parse(rulesRow.value);
      fs.writeFileSync(RULES_OUT, JSON.stringify(rules, null, 2), "utf8");
      const enabledCount = Array.isArray(rules) ? rules.filter((r: any) => r?.enabled).length : 0;
      console.log(`✅ 已导出接口权限规则快照：${path.relative(ROOT, RULES_OUT)}`);
      console.log(`   规则总数 ${Array.isArray(rules) ? rules.length : 0}，其中已启用 ${enabledCount}`);
    } else {
      console.log("（未找到接口权限规则数据，跳过规则快照导出）");
    }

    console.log("   提示：修改了后台权限目录 / 接口权限规则后请重新执行本命令，并提交快照文件。");
  } catch (error) {
    console.error("导出权限目录快照失败：", error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
