async function main() {
  const token =
    "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJjbXRkMDRsNjYwMDAweTJtaXo2YXY1MnFuIiwicm9sZSI6IlVTRVIiLCJleHAiOjE3ODk5MDI1Nzd9.Lhl0yHY0XFuaKEB2J1AG37fPqrE0K3zLLi42oM_fgig";

  const meRes = await fetch("http://localhost:3000/api/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `auth_token=${token}`,
    },
  });
  console.log("ME_STATUS:", meRes.status);
  console.log("ME_BODY:", await meRes.text());
}

main().catch(console.error);

// 显式声明为模块作用域，避免与其它脚本文件的顶层 main 冲突（TS2393）
export {};
