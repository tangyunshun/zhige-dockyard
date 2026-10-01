import { SignJWT } from "jose";

async function main() {
  const secret = new TextEncoder().encode("zhige-dockyard-jwt-secret-key-2024-change-this");
  const token = await new SignJWT({
    userId: "cmtd04l660000y2miz6av52qn",
    role: "USER",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);

  const res = await fetch("http://localhost:3000/workspace/ws-personal-1787924572254-wu6kio", {
    headers: {
      Cookie: `auth_token=${token}`,
      Authorization: `Bearer ${token}`,
    },
    redirect: "manual",
  });

  console.log("STATUS_3000:", res.status);
  console.log("HEADERS_3000:", Object.fromEntries(res.headers.entries()));
}

main().catch(console.error);
