import fs from "fs";
import path from "path";

const chunksDir = path.resolve(".next/static/chunks");
const files = fs.readdirSync(chunksDir).filter((f) => f.endsWith(".js"));

// 全局搜索 currentWorkspaceId: 的所有位置（排除 AppContext chunk 0f.fudm2g_ku2.js 的重复）
for (const f of files) {
  const content = fs.readFileSync(path.join(chunksDir, f), "utf8");
  if (!content.includes("currentWorkspaceId:")) continue;
  let idx = 0, count = 0;
  while ((idx = content.indexOf("currentWorkspaceId:", idx)) !== -1 && count < 6) {
    const snip = content.slice(Math.max(0, idx - 300), idx + 250);
    console.log(`[${f}] @${idx}:`);
    console.log(snip.replace(/\n/g, " ").slice(0, 500));
    console.log("======");
    idx += 20;
    count++;
  }
}
