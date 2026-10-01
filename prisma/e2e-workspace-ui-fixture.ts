/**
 * 前端入口 E2E 取证夹具（OverviewTab / 工作台组件入口）
 *
 * 用途：创建固定 ID 的临时用户 + 个人空间 + 额度，并写出一份浏览器登录态 state 文件，
 * 供 agent-browser 以登录身份打开 /workspace/<id> 验证工作台组件入口的合同就绪拦截。
 *
 * 安全约束：
 *  - 只创建/删除固定前缀（u_wsui_e2e / ws_wsui_e2e）的临时数据，绝不触碰真实业务数据；
 *  - state 文件只写到 .next/e2e-state.json（本地临时产物），验证后必须删除；
 *  - 不打印任何密钥值（JWT_SECRET 仅在本进程内用于签名）。
 *
 * 用法：
 *   npx tsx prisma/e2e-workspace-ui-fixture.ts setup     # 创建夹具 + 输出 state 文件路径与 URL
 *   npx tsx prisma/e2e-workspace-ui-fixture.ts cleanup   # 删除夹具与 state 文件
 */
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

const USER_ID = "u_wsui_e2e";
const WORKSPACE_ID = "ws_wsui_e2e";
const STATE_PATH = path.join(process.cwd(), ".next", "e2e-state.json");

function fail(msg: string): never {
  console.error("FIXTURE_FAIL", msg);
  process.exit(2);
}

async function cleanup() {
  await prisma.document.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.pointledger.deleteMany({ where: { userId: USER_ID } });
  await prisma.pointgrant.deleteMany({ where: { userId: USER_ID } });
  await prisma.refundrecovery.deleteMany({ where: { userId: USER_ID } });
  await prisma.userwallet.deleteMany({ where: { userId: USER_ID } });
  await prisma.componenttask.deleteMany({ where: { userId: USER_ID } });
  await prisma.componentusage.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.workspacemember.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.workspacequota.deleteMany({ where: { workspaceId: WORKSPACE_ID } });
  await prisma.workspace.deleteMany({ where: { id: WORKSPACE_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
}

async function setup() {
  await cleanup(); // 幂等：先清掉可能的历史残留

  const secret = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
  const balance = BigInt(100000);
  const now = new Date();

  await prisma.user.create({ data: { id: USER_ID, password: "x", role: "USER", status: "active" } });
  await prisma.workspace.create({
    data: { id: WORKSPACE_ID, name: "工作台入口E2E", ownerId: USER_ID, type: "PERSONAL", updatedAt: now },
  });
  await prisma.workspacemember.create({
    data: { id: "m_wsui_e2e", userId: USER_ID, workspaceId: WORKSPACE_ID, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance },
  });
  await prisma.userwallet.create({ data: { id: "w_wsui_e2e", userId: USER_ID, balance } });
  await prisma.workspacequota.create({
    data: { id: "q_wsui_e2e", workspaceId: WORKSPACE_ID, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: now },
  });
  await prisma.pointgrant.create({
    data: {
      id: "g_wsui_e2e", scope: "WALLET", userId: USER_ID, workspaceId: null,
      points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE",
    },
  });

  const token = await new SignJWT({ userId: USER_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(secret));

  // agent-browser --state 使用 Playwright storageState 结构（cookies + origins/localStorage）
  const state = {
    cookies: [
      {
        name: "auth_token",
        value: token,
        domain: "localhost",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 7200,
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [
      {
        origin: "http://localhost:3100",
        localStorage: [
          { name: "auth_token", value: token },
          { name: "userId", value: USER_ID },
        ],
      },
    ],
  };

  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });

  console.log(
    JSON.stringify(
      { status: "READY", workspaceId: WORKSPACE_ID, url: `http://localhost:3100/workspace/${WORKSPACE_ID}`, statePath: STATE_PATH },
      null,
      2,
    ),
  );
}

const action = process.argv[2];
(action === "setup" ? setup() : action === "cleanup" ? cleanup() : Promise.reject(new Error(`未知动作: ${action}`)))
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    await prisma.$disconnect();
    fail((e as Error)?.message || String(e));
  });
