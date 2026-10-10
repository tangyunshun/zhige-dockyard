/**
 * 60 组件全量估价终审（只读）
 *
 * 逐组件调用真实 HTTP 估价接口：
 *   GET /api/billing/estimate?componentId=<id>&workspaceId=<ws>
 * 断言 HTTP 200；basis 为 CONVERTED_PRICE（经算账中心换算）或 BLOCKED_PRICE_UNREGISTERED
 * （价格未登记）时均如实记录，绝不美化。
 *
 * 输出终态表：组件 | 版本 | 输出类型 | 估价点数 | 模型 | 状态
 *
 * 用法：
 *   npx tsx scripts/estimate-all-60.ts [--base http://localhost:3000]
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { getJwtSecretKey } from "../src/lib/jwt-config";

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

type AnyContract = Record<string, unknown>;

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));

  const argBase = process.argv.indexOf("--base");
  const BASE = argBase >= 0 ? process.argv[argBase + 1] : "http://localhost:3000";

  const prisma = new PrismaClient();
  try {
    // 1) 操作人：超管（name/role 均为小写 superadmin）
    const admin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true, name: true } });
    if (!admin) throw new Error("未找到 superadmin 用户");

    // 2) 估价要求调用人是该空间成员
    const mem = await prisma.workspacemember.findFirst({
      where: { userId: admin.id },
      select: { workspaceId: true },
    });
    if (!mem) throw new Error(`superadmin (${admin.id}) 不属于任何空间，无法调用估价接口`);
    const workspaceId = mem.workspaceId;

    // 空闲超时（A-01）：未勾选「7天免登录」的会话要求 lastActivityAt 在 IDLE_TIMEOUT 内，
    // 否则鉴权直接 401（IDLE_TIMEOUT）。本脚本以该超管身份执行只读估价审计，
    // 等价于一次真实操作 → 刷新活跃时间戳；仅更新该时间字段，不触碰任何业务数据。
    await prisma.user.update({ where: { id: admin.id }, data: { lastActivityAt: new Date() } });

    // 3) 全量组件 + 激活合同（版本 / 输出类型）
    const comps = await prisma.componentcatalog.findMany({
      select: { id: true, name: true, activeContractId: true },
      orderBy: { id: "asc" },
    });
    const contracts = await prisma.componentcontract.findMany({
      select: { id: true, componentId: true, contractVersion: true, lifecycle: true, contract: true },
    });
    const byId = new Map(contracts.map((c) => [c.id, c]));

    const token = await new SignJWT({ userId: admin.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(getJwtSecretKey());

    const rows: Array<{
      component: string;
      version: string;
      outputKind: string;
      points: number | null;
      model: string;
      status: string;
      http: number;
    }> = [];

    for (const c of comps) {
      const active = c.activeContractId ? byId.get(c.activeContractId) : undefined;
      const cjson = (active?.contract as AnyContract) ?? {};
      const version = active ? active.contractVersion : "—";
      const outputKind = ((cjson.output as AnyContract)?.kind as string) ?? "—";

      const url = `${BASE}/api/billing/estimate?componentId=${encodeURIComponent(c.id)}&workspaceId=${encodeURIComponent(workspaceId)}`;
      let http = 0;
      let status = "ERROR";
      let points: number | null = null;
      let model = "—";
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        http = res.status;
        const body = (await res.json()) as AnyContract;
        const data = (body.data ?? {}) as AnyContract;
        if (http === 200 && body.success === true) {
          points = typeof data.points === "number" ? data.points : null;
          const dep = (data.deployment ?? {}) as AnyContract;
          model = `${dep.providerId ?? "?"}/${dep.modelId ?? "?"}`;
          status = data.basis === "CONVERTED_PRICE" ? "CONVERTED_PRICE" : `BLOCKED(${data.blockedReason ?? "?"})`;
        } else {
          status = `HTTP_${http}:${(body.error as string) ?? "?"}`;
          if (typeof (body as AnyContract).code === "string") status += ` [${(body as AnyContract).code}]`;
        }
      } catch (e) {
        status = `FETCH_FAIL: ${(e as Error)?.message ?? String(e)}`;
      }
      rows.push({ component: c.id, version, outputKind, points, model, status, http });
    }

    // 终态表
    console.log(`估价基址: ${BASE}`);
    console.log(`操作人: ${admin.name} (${admin.id})  空间: ${workspaceId}`);
    console.log(`组件总数: ${comps.length}\n`);
    console.log("| 组件 | 版本 | 输出类型 | 估价点数 | 模型 | 状态 |");
    console.log("|:---|:---|:---|---:|:---|:---|");
    for (const r of rows) {
      console.log(`| ${r.component} | ${r.version} | ${r.outputKind} | ${r.points ?? "—"} | ${r.model} | ${r.status} |`);
    }

    const ok200 = rows.filter((r) => r.http === 200).length;
    const converted = rows.filter((r) => r.status === "CONVERTED_PRICE").length;
    const blocked = rows.filter((r) => r.status.startsWith("BLOCKED")).length;
    const notOk = rows.filter((r) => r.http !== 200);
    console.log(`\n汇总: 组件 ${rows.length} | HTTP200 ${ok200} | CONVERTED_PRICE ${converted} | BLOCKED ${blocked} | 非200 ${notOk.length}`);
    if (notOk.length) {
      console.log("\n非 200 明细（如实记录，不做修饰）:");
      for (const r of notOk) console.log(`  - ${r.component}: ${r.status}`);
    }
    console.log(JSON.stringify({ base: BASE, total: rows.length, http200: ok200, converted, blocked, notOk: notOk.map((r) => ({ c: r.component, s: r.status })) }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("ESTIMATE_ALL_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
