import { SignJWT } from "jose";
import { validateUser } from "../src/lib/auth";

const SECRET = new TextEncoder().encode("zhige-dockyard-jwt-secret-key-2024-change-this");
const USER_ID = "cmr7qn72l0003uuhb42pzscva"; // test-01

async function main() {
  const token = await new SignJWT({ userId: USER_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(SECRET);
  const header = `Bearer ${token}`;

  // 不传 request
  const r1 = await validateUser(header);
  console.log("[不传 request]:", r1.valid, r1.error || `user=${r1.user?.id}`);

  // 传假 request（含 x-user-id 一致）
  const r2 = await validateUser(header, {
    headers: { get: (k: string) => (k === "x-user-id" ? USER_ID : null) },
  });
  console.log("[传 request, x-user-id 一致]:", r2.valid, r2.error || `user=${r2.user?.id}`);

  // 传假 request（无 x-user-id）
  const r3 = await validateUser(header, {
    headers: { get: () => null },
  });
  console.log("[传 request, 无 x-user-id]:", r3.valid, r3.error || `user=${r3.user?.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
