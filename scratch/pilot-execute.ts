/**
 * 【批次2真实试点】执行一次组件任务并对账（真实 HTTP + 真实模型 + 只读 DB 核对）
 * 用法：npx tsx scratch/pilot-execute.ts <C01|C07> <success|fail> <序号>
 *  - fail 模式需要服务端以 MODEL_TIMEOUT_MS=1 启动（可控制造真实模型超时）
 *  - 身份：test01 专用测试账号（自签 JWT，服务端真实密钥；身份验证链路完整，不走密码登录）
 */
import fs from "fs";
import path from "path";
import { loadCliEnv } from "../scripts/cli-env";
loadCliEnv();
import { SignJWT } from "jose";
import { prisma } from "../src/lib/prisma";

const USER_ID = "cmtd04l660000y2miz6av52qn";
const WS_ID = "ws-enterprise-1787927954618-9arzol";
const BASE = "http://127.0.0.1:3000";

const C01_MATERIAL = `招标文件节选：本项目为智慧园区综合管理平台建设项目，要求投标方具备信息系统集成及服务资质二级及以上，需提交技术方案、商务报价、偏离表与风险说明。工期 90 天，预算 120 万元。技术要求：支持人脸识别门禁、车辆管理、能耗监测；数据须本地化部署；提供三年免费运维。评分办法：技术分 60 分，商务分 30 分，价格分 10 分。投标人须在开标前缴纳投标保证金 2 万元。`;

const C07_MATERIAL = `会议纪要：讨论订单中心重构方案。目标：支持拆单、退款与对账自动化，降低人工客服工单 30%。参与人：产品、后端、测试。决议一：拆单规则按仓库维度优先，其次按品类；决议二：退款接口需幂等，支持部分退款；决议三：对账 T+1 出报表，差异自动标记；决议四：涉及订单、支付、结算三个模块，分两期交付，一期覆盖订单与支付。风险：历史数据迁移量大，需回滚方案。`;

async function main() {
  const [componentId, mode, seq] = process.argv.slice(2);
  if (!componentId || !mode) throw new Error("用法: pilot-execute.ts <C01|C07> <success|fail> <seq>");

  // 执行前刷新 test01 活跃时间，避免 10 分钟空闲超时误拦（测试账号，非业务写库）
  await prisma.user.update({ where: { id: USER_ID }, data: { lastActivityAt: new Date() } });

  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);
  const token = await new SignJWT({ userId: USER_ID, issuedAt: new Date().toISOString() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(secret);

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let res: Response;
  if (componentId === "C01") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("workspaceId", WS_ID);
    form.append("componentId", "C01");
    form.append("taskName", `批次2试点 C01-${mode}-${seq}`);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const bytes = Buffer.from(C01_MATERIAL, "utf-8");
    form.append("file", new Blob([new Uint8Array(bytes)], { type: "text/plain" }), `pilot-c01-${seq}.txt`);
    res = await fetch(`${BASE}/api/studio`, { method: "POST", headers, body: form });
  } else {
    headers["Content-Type"] = "application/json";
    res = await fetch(`${BASE}/api/studio`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: "simulate",
        workspaceId: WS_ID,
        componentId: "C07",
        taskName: `批次2试点 C07-${mode}-${seq}`,
        inputMaterial: C07_MATERIAL,
      }),
    });
  }
  const json = await res.json().catch(() => ({}));
  console.log("HTTP", res.status, JSON.stringify({
    success: json?.success,
    code: json?.code ?? null,
    taskId: json?.task?.id ?? json?.taskId ?? null,
    depositPoints: json?.depositPoints ?? null,
    estimatedPoints: json?.estimatedPoints ?? null,
    actualPoints: json?.actualPoints ?? null,
    settlementStatus: json?.settlementStatus ?? null,
    settlementMode: json?.settlementMode ?? null,
    cost: json?.cost ?? null,
    errorCode: json?.errorCode ?? (json?.task?.result?.errorCode ?? null),
    error: json?.error ? String(json.error).slice(0, 100) : null,
  }));

  const taskId = json?.task?.id ?? json?.taskId ?? null;
  if (taskId) {
    const task = await prisma.componenttask.findUnique({ where: { id: taskId }, select: { status: true, config: true, result: true } });
    const cfg = (task?.config ?? {}) as Record<string, unknown>;
    console.log("DB task:", JSON.stringify({ status: task?.status, depositPoints: cfg.depositPoints, settlementMode: cfg.settlementMode, billingMode: cfg.billingMode, errorCode: (task?.result as any)?.errorCode }));
    const ledgers = await prisma.pointledger.findMany({ where: { taskId }, orderBy: { createdAt: "asc" }, select: { type: true, points: true, idempotencyKey: true } });
    console.log("DB ledgers:", JSON.stringify(ledgers.map((l) => ({ t: l.type, p: Number(l.points), k: l.idempotencyKey?.slice(0, 16) }))));
    const holds = await (prisma as any).tokensettlementhold?.findMany({ where: { taskId }, select: { status: true, holdPoints: true } }).catch(() => []);
    const settles = await (prisma as any).tokensettlement?.findMany({ where: { taskId }, select: { status: true, holdPoints: true, actualPricePoints: true, releasedPoints: true, supplementPoints: true, inputTokens: true, outputTokens: true } }).catch(() => []);
    if (holds?.length) console.log("DB hold:", JSON.stringify(holds, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
    if (settles?.length) console.log("DB settlement:", JSON.stringify(settles, (_, v) => (typeof v === "bigint" ? Number(v) : v)));
  }
  if (!json?.success && mode === "success") process.exitCode = 2;
}
main()
  .catch((e) => { console.error("PILOT FAIL:", e?.message || e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
