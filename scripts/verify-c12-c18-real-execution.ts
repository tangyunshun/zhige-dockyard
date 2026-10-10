/**
 * C12 / C18 @1.1.0 真实执行验证（三件套第 2、3 项）
 *
 * 以真实业务材料调用 POST /api/studio（action=simulate），校验：
 *   ① 任务成功；
 *   ② 产物通过 DOCUMENT 门禁（requiredSections 子串命中：C12=DDL/Mermaid/关联，C18=实体/Mermaid/关系）；
 *   ③ 产物确实包含 ```mermaid erDiagram 代码块与 DDL 语句（Mermaid 文本等价方案落地证据）。
 *
 * 费用极低（估价 5 点 ≈ ¥0.05），仅产生真实模型调用费用。
 *
 * 用法：
 *   npx tsx scripts/verify-c12-c18-real-execution.ts C12
 *   npx tsx scripts/verify-c12-c18-real-execution.ts C18
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

/** 真实业务材料（非占位、非测试替身） */
const MATERIAL: Record<string, string> = {
  C12:
    "电商中台接口数据关联设计：一个用户可以下多个订单，一个订单只属于一个商家，商家可以同时上架多个商品；" +
    "商品归属唯一分类，一个订单包含多个商品（需记录下单时的单价与数量）；订单需关联唯一收货地址，地址属于用户。" +
    "请给出表关系设计、完整 DDL、Mermaid ER 图与关联拓扑表（表A | 关系 | 表B | 外键字段）。",
  C18:
    "内容社区数据表结构设计：用户表需要主键、昵称、手机号、注册时间；文章表需要主键、作者、标题、正文、发布时间；" +
    "评论表需要主键、所属文章、评论人、内容、创建时间；用户与文章为一对多，文章与评论为一对多。" +
    "请给出实体与字段清单、Mermaid ER 图与关系说明。",
};

const EXPECTED_SECTIONS: Record<string, string[]> = {
  C12: ["DDL", "Mermaid", "关联"],
  C18: ["实体", "Mermaid", "关系"],
};

type AnyJson = Record<string, unknown>;

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));
  const argBase = process.argv.indexOf("--base");
  const BASE = argBase >= 0 ? process.argv[argBase + 1] : "http://localhost:3000";
  const componentId = (process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "C12").toUpperCase();
  const argOf = (flag: string): string | undefined => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const userOverride = argOf("--user");
  const wsOverride = argOf("--ws");

  const prisma = new PrismaClient();
  try {
    // 操作人默认 superadmin；可通过 --user 指定（真实执行要求 workspaceId 必须同时是 tenant，
    // 否则 componenttask.tenantId 外键会失败，故默认空间可经 --ws 覆盖为「租户工作区」）
    const admin = userOverride
      ? await prisma.user.findUnique({ where: { id: userOverride }, select: { id: true } })
      : await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true } });
    if (!admin) throw new Error("未找到操作用户");
    const mem = wsOverride
      ? { workspaceId: wsOverride }
      : await prisma.workspacemember.findFirst({ where: { userId: admin.id }, select: { workspaceId: true } });
    if (!mem) throw new Error("操作用户不属于任何空间");
    // 刷新活跃时间，避免空闲超时（A-01）拦截
    await prisma.user.update({ where: { id: admin.id }, data: { lastActivityAt: new Date() } });

    const token = await new SignJWT({ userId: admin.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(getJwtSecretKey());

    const body = {
      action: "simulate",
      workspaceId: mem.workspaceId,
      componentId,
      inputMaterial: MATERIAL[componentId] ?? MATERIAL.C12,
    };
    console.log(`[${componentId}] 提交真实执行，材料: ${body.inputMaterial.slice(0, 60)}...`);

    const res = await fetch(`${BASE}/api/studio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const http = res.status;
    const text = await res.text();
    let json: AnyJson = {};
    try { json = JSON.parse(text) as AnyJson; } catch { /* 非 JSON 响应 */ }

    const data = (json.data ?? {}) as AnyJson;
    // 产物文本：兼容多种返回结构
    const candidates = [data.output, data.content, data.result, json.output, json.content, json.result];
    let output = "";
    for (const c of candidates) {
      if (typeof c === "string" && c.length > output.length) output = c;
      else if (c && typeof c === "object") {
        const inner = (c as AnyJson).content ?? (c as AnyJson).text;
        if (typeof inner === "string" && inner.length > output.length) output = inner;
      }
    }

    const expected = EXPECTED_SECTIONS[componentId] ?? [];
    const sectionHits = expected.map((s) => ({ section: s, hit: output.includes(s) }));
    const hasMermaidBlock = /```\s*mermaid/i.test(output);
    const hasErDiagram = /erDiagram/i.test(output);
    const hasDdl = /CREATE\s+TABLE/i.test(output);

    console.log(JSON.stringify({
      componentId,
      http,
      success: json.success ?? null,
      error: json.error ?? null,
      code: json.code ?? null,
      taskId: data.taskId ?? json.taskId ?? null,
      taskStatus: data.status ?? data.taskStatus ?? json.status ?? null,
      outputLength: output.length,
      requiredSections: sectionHits,
      sectionsAllHit: sectionHits.every((s) => s.hit),
      hasMermaidBlock,
      hasErDiagram,
      hasDdl,
      gatePass: sectionHits.every((s) => s.hit) && hasMermaidBlock && hasErDiagram,
    }, null, 2));

    if (output) {
      const idx = output.search(/```\s*mermaid/i);
      console.log("\n--- Mermaid 片段（前后各 220 字）---");
      console.log(output.slice(Math.max(0, idx - 220), Math.min(output.length, (idx < 0 ? 0 : idx) + 420)));
    } else {
      console.log("\n--- 原始响应（截断 1200 字）---");
      console.log(text.slice(0, 1200));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("VERIFY_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
