// 真实登录生成 Playwright storage state（凭据来自环境变量，绝不硬编码）。
// 同时写入 localStorage["auth_token"] 与 cookie["auth_token"]，符合 src/utils/auth.ts 的认证机制。
import fs from "fs";
import path from "path";

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const account = process.env.TEST_ACCOUNT || "";
const pwd = process.env.TEST_PWD || "";

async function main() {
  if (!account || !pwd) {
    console.error("MISSING_ENV: TEST_ACCOUNT / TEST_PWD");
    process.exit(2);
  }
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account, password: pwd }),
  });
  const body: any = await res.json();
  const token: string = body?.token || "";
  const setCookie: string = res.headers.get("set-cookie") || "";
  const cookieVal = (setCookie.match(/auth_token=([^;]+)/) || [])[1] || token;

  // 从 JWT payload 提取 userId（不校验签名，仅作本地标识）
  let userId = "";
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf-8"));
    userId = payload.userId || "";
  } catch {
    /* ignore */
  }

  if (!token || !cookieVal) {
    console.error("LOGIN_FAILED");
    process.exit(3);
  }

  const state = {
    cookies: [
      {
        name: "auth_token",
        value: cookieVal,
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [
      {
        origin: BASE,
        localStorage: [
          { name: "auth_token", value: cookieVal },
          ...(userId ? [{ name: "userId", value: userId }] : []),
        ],
      },
    ],
  };

  const out = path.join(process.cwd(), ".codebuddy", "browser-storage-state.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(state, null, 2), "utf-8");
  console.log("STORAGE_STATE_WRITTEN=" + out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
