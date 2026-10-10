import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

/**
 * 测试套件隔离（精确到文件，禁止按目录一刀切）：
 * 仓库同时存在 vitest 风格与 node:test 风格两类 *.test.ts，
 * vitest 无法识别 node:test 的套件（会误报 No test suite found），
 * 因此必须把「文件头 import 了 node:test」的文件逐个排除，
 * 而不能按 __tests__ 目录排除——那样会把大量 vitest 风格测试一起静默砍掉。
 */
function collectTestFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      collectTestFiles(p, out);
    } else if (/\.test\.tsx?$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** 判定 node:test 风格：文件内出现 import ... from "node:test" 或 require("node:test") */
function isNodeTestFile(file: string): boolean {
  let src = "";
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return (
    /from\s+["']node:test["']/.test(src) ||
    /require\(\s*["']node:test["']\s*\)/.test(src) ||
    /from\s+["']node:test\/.*["']/.test(src)
  );
}

const nodeTestFiles = collectTestFiles(path.resolve(__dirname, "src"))
  .filter(isNodeTestFile)
  .map((f) => path.relative(__dirname, f).split(path.sep).join("/"));

if (process.env.VITEST_DEBUG_CONFIG === "1") {
  console.log(`[vitest.config] 排除 node:test 风格文件 ${nodeTestFiles.length} 个`);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // 仅排除确认使用 node:test 的文件，其余 vitest 风格测试全部保留进主链路
    exclude: ["**/node_modules/**", ...nodeTestFiles],
    testTimeout: 60000,
    hookTimeout: 60000,
    // 串行执行测试文件（关闭跨文件并行）：
    // 账务类集成测试（如 refund-integration）直接对**同一个真实 MySQL 库**执行扣点/退款事务，
    // 各文件虽已用随机 UUID 隔离记录，但事务会在 pointledger / pointgrant / workspacequota 等
    // 全局表上产生行锁与间隙锁竞争（不同于「各自独立 schema」的隔离方式）。
    // 跨文件并发时会出现间歇性的事务冲突/死锁失败（单独跑或串行跑均全绿，属偶发竞争而非真实回归）。
    // 因此此处关闭文件级并行以换取确定性；串行全量耗时约 13s（并行约 6s），代价可接受。
    fileParallelism: false,
  },
});
