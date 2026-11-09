// 临时脚本：U05/原9 —— 移除 x-user-id 快速通道，一律完整 validateUser
const fs = require("fs");

function patch(file, oldStr, newStr) {
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes(oldStr)) { console.log("ANCHOR MISS:", file); process.exitCode = 1; return; }
  s = s.replace(oldStr, newStr, 1);
  fs.writeFileSync(file, s);
  console.log("patched:", file);
}

// 1. workspace-hub/dashboard
patch(
  "src/app/api/user/workspace-hub/dashboard/route.ts",
  `    // 优先从中间件注入的 x-user-id 获取
    userId = request.headers.get("x-user-id");

    // 如果没有 x-user-id，尝试从 Authorization header 获取
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      if (authHeader && authHeader !== "Bearer null" && authHeader !== "Bearer ") {
        const authResult = await validateUser(authHeader);
        if (authResult.valid) {
          userId = authResult.user!.id;
          userRole = authResult.user!.role || "user";
        }
      }
    }`,
  `    // [U05/原9] 一律完整 validateUser（会话/封禁/强制下线/到期一致校验）：
    // 中间件验签的 x-user-id 不等于有效会话，不得跳过完整拒绝语义
    {
      const authResult = await validateUser(request.headers.get("authorization"), request);
      if (authResult.valid && authResult.user) {
        userId = authResult.user!.id;
        userRole = authResult.user!.role || "user";
      }
    }`
);

// 2. workspace/list
patch(
  "src/app/api/workspace/list/route.ts",
  `    // 验证用户身份
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: authResult.error }, { status: 401 });
      } else {
        userId = authResult.user!.id;
      }
    }`,
  `    // [U05/原9] 一律完整 validateUser：x-user-id 验签身份不等于有效会话
    const listAuth = await validateUser(request.headers.get("authorization"), request);
    if (!listAuth.valid || !listAuth.user) {
      return NextResponse.json({ error: listAuth.error || "未授权" }, { status: 401 });
    }
    const userId = listAuth.user!.id;`
);

// 3. workspace/switch
patch(
  "src/app/api/workspace/switch/route.ts",
  `    // 验证用户身份
    let userId = request.headers.get('x-user-id');
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {`,
  `    // [U05/原9] 一律完整 validateUser：x-user-id 验签身份不等于有效会话
    let userId: string | null = null;
    {
      const switchAuth = await validateUser(request.headers.get("authorization"), request);
      if (!switchAuth.valid || !switchAuth.user) {
        return NextResponse.json({ error: switchAuth.error || "未授权" }, { status: 401 });
      }
      userId = switchAuth.user!.id;
    }
    if (false) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {`
);

// 4. workspace/upgrade（GET 与 POST 两处）
const up = "src/app/api/workspace/upgrade/route.ts";
let us = fs.readFileSync(up, "utf8");
const upgradeOld = `    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authHeader = request.headers.get("authorization");
      const authResult = await validateUser(authHeader);
      if (!authResult.valid) {
        return NextResponse.json({ error: "未授权访问" }, { status: 401 });
      }
      userId = authResult.user!.id;
    }`;
const upgradeNew = `    // [U05/原9] 一律完整 validateUser：x-user-id 验签身份不等于有效会话
    const upgradeAuth = await validateUser(request.headers.get("authorization"), request);
    if (!upgradeAuth.valid || !upgradeAuth.user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }
    const userId = upgradeAuth.user!.id;`;
let count = 0;
while (us.includes(upgradeOld)) {
  us = us.replace(upgradeOld, upgradeNew.replace("upgradeAuth", "upgradeAuth" + (count > 0 ? count : "")), 1);
  count++;
}
fs.writeFileSync(up, us);
console.log("patched upgrade x", count);

// 5. workspace/create-personal
patch(
  "src/app/api/workspace/create-personal/route.ts",
  `    // 统一鉴权（与 /api/workspace/list 保持一致）：
    // 优先使用中间件注入并验签过的 x-user-id；缺失时通过 validateUser 校验
    // Authorization Bearer JWT 或 Cookie auth_token JWT（明文 userId 一律拒绝）。
    let userId = request.headers.get("x-user-id");
    if (!userId) {
      const authResult = await validateUser(
        request.headers.get("authorization"),
        request,
      );
      if (!authResult.valid) {
        return NextResponse.json(
          { message: "未授权" },`,
  `    // [U05/原9] 统一鉴权：一律完整 validateUser（会话/封禁/强制下线/到期一致校验），
    // 中间件验签的 x-user-id 不等于有效会话（明文 userId 一律拒绝）。
    {
      const authResult = await validateUser(
        request.headers.get("authorization"),
        request,
      );
      if (!authResult.valid) {
        return NextResponse.json(
          { message: "未授权" },`
);
