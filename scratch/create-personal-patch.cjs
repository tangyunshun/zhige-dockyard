// 临时脚本：create-personal 鉴权补丁（行级）
const fs = require("fs");
const p = "src/app/api/workspace/create-personal/route.ts";
let lines = fs.readFileSync(p, "utf8").split("\n");
const out = [];
let i = 0, patched = 0;
while (i < lines.length) {
  const l = lines[i];
  if (l.includes('let userId = request.headers.get("x-user-id");')) {
    // 找到该行所在块的起点（注释三行在上方）与终点（if (!userId) { ... } 的闭合）
    // 替换注释行（上方 3 行）
    out.length -= 3;
    out.push("    // [U05/原9] 统一鉴权：一律完整 validateUser（会话/封禁/强制下线/到期一致校验），");
    out.push("    // 中间件验签的 x-user-id 不等于有效会话（明文 userId 一律拒绝）。");
    out.push("    let userId: string | null = null;");
    out.push("    {");
    out.push('      const authResult = await validateUser(');
    out.push('        request.headers.get("authorization"),');
    out.push("        request,");
    out.push("      );");
    out.push("      if (!authResult.valid || !authResult.user) {");
    out.push('        return NextResponse.json(');
    out.push('          { message: "未授权" },');
    out.push("          { status: 401 },");
    out.push("        );");
    out.push("      }");
    out.push("      userId = authResult.user!.id;");
    out.push("    }");
    // 跳过原块：当前行 let userId ... 直到 `    }`（闭合 if (!userId)）
    i++; // 越过 let userId 行
    let depth = 1; // 已进入 if (!userId) {
    while (i < lines.length && depth > 0) {
      const t = lines[i].trim();
      if (t.endsWith("{")) depth++;
      else if (t === "}") depth--;
      i++;
    }
    patched++;
    continue;
  }
  out.push(l);
  i++;
}
fs.writeFileSync(p, out.join("\n"));
console.log("patched blocks:", patched);
