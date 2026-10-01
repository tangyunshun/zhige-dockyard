/**
 * 安装 Git 提交前钩子（把 scripts/git-hooks/* 写入 .git/hooks/）。
 * 由 package.json 的 "prepare" 自动调用，也可手动执行：npm run hooks:install
 * 安装失败不阻断 npm install（exit 0），避免影响他人环境。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "scripts", "git-hooks");
const HOOKS_DIR = path.join(ROOT, ".git", "hooks");
const HOOKS = ["pre-commit"];

function main() {
  try {
    if (!fs.existsSync(path.join(ROOT, ".git"))) {
      console.log("[hooks] 非 Git 仓库（未找到 .git），跳过钩子安装");
      return;
    }
    if (!fs.existsSync(SRC_DIR)) {
      console.log("[hooks] 未找到 scripts/git-hooks，跳过");
      return;
    }
    fs.mkdirSync(HOOKS_DIR, { recursive: true });

    for (const hook of HOOKS) {
      const src = path.join(SRC_DIR, hook);
      const dest = path.join(HOOKS_DIR, hook);
      if (!fs.existsSync(src)) continue;

      // 统一使用 LF：否则 Windows 上写出的 CRLF 会让 `#!/bin/sh` 变成 `#!/bin/sh\r`，
      // 导致 Git for Windows 报 "bad interpreter"。
      const content = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");
      fs.writeFileSync(dest, content, { encoding: "utf8" });
      try {
        fs.chmodSync(dest, 0o755);
      } catch {
        // Windows 上 chmod 可能无效，Git for Windows 仍会执行该脚本
      }
      console.log(`[hooks] 已安装 ${hook} -> .git/hooks/${hook}`);
    }
  } catch (error) {
    console.warn("[hooks] 安装 Git 钩子失败（不影响使用）：", error);
  }
}

main();
