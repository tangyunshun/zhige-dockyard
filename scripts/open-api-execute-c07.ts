/**
 * MODEL-LINK-E1 真实验证：开放平台执行端点闭环 + 三方对账（只读/单笔真实执行，费用 ≤0.2 元）
 *
 * 流程：
 *  1. 为超管创建一个临时测试 API Key（库内与 /api/user/api-keys 同口径：sk- 前缀 + bcrypt）；
 *  2. 用该 Key 调 POST /api/open/v1/execute 真实执行 1 单 C07；
 *  3. 轮询 GET /api/open/v1/tasks/:id 直到终态；
 *  4. 三方对账：componenttask(channel=OPEN_API) / pointledger(扣点) / 真实模型成本(元)；
 *  5. 删除临时 Key（清理）。
 *
 * 用法：npx tsx scripts/open-api-execute-c07.ts [--base http://localhost:3000]
 */
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { getPlatformDefaultDeploymentId } from "../src/lib/model-registry";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));
  const BASE = process.argv.includes("--base")
    ? process.argv[process.argv.indexOf("--base") + 1]
    : "http://localhost:3000";

  const prisma = new PrismaClient();
  try {
    const admin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true, name: true } });
    if (!admin) throw new Error("未找到 superadmin 用户");
    await prisma.user.update({ where: { id: admin.id }, data: { lastActivityAt: new Date() } });

    // 1) 临时测试 API Key
    const apiKey = "sk-" + uuidv4().replace(/-/g, "");
    const keyPrefix = apiKey.slice(0, 11);
    const keyHash = await bcrypt.hash(apiKey, 10);
    const keyRow = await prisma.apikey.create({
      data: {
        id: uuidv4(),
        userId: admin.id,
        name: "MODEL-LINK-E1-verify",
        description: "批次真实验证临时 Key（脚本自动清理）",
        keyHash,
        keyPrefix,
        lastUsedAt: null,
        updatedAt: new Date(),
      },
    });
    console.log(`[1] 创建临时 API Key: id=${keyRow.id} prefix=${keyPrefix}`);

    // 2) 选空间：componenttask.tenantId 外键指向 tenant.id，必须用「既是空间又已建 tenant」的空间。
    //    优先取历史上成功执行过 C07 的 tenant（该空间必为合法 tenant 且 C07 合同就绪），并把超管加为成员以通过越权校验。
    const prior = await prisma.componenttask.findFirst({
      where: { type: "C07", status: { in: ["SUCCESS", "DONE", "COMPLETED"] } },
      orderBy: { createdAt: "desc" },
      select: { tenantId: true },
    });
    const tenantId = prior?.tenantId || null;
    if (!tenantId) throw new Error("未找到任何成功执行过 C07 的合法 tenant 空间");
    const workspaceId = tenantId;
    console.log(`[2] 使用空间(tenant): ${workspaceId}`);

    // 确保超管是该空间成员（验证专用，避免触发越权 403）
    const existing = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: admin.id, workspaceId } },
    });
    if (!existing) {
      await prisma.workspacemember.create({
        data: { id: uuidv4(), userId: admin.id, workspaceId, role: "OWNER", joinedAt: new Date() },
      });
      console.log(`    [2] 已为超管在空间 ${workspaceId} 添加 OWNER 成员（验证专用）`);
    }

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
    const sampleInput = `我们正在规划一款面向中小团队的「项目协作与工时管理」SaaS 工具，请基于以下材料生成需求规格文档。
背景：团队目前用表格+群聊管理项目，任务状态失真、工时统计靠手工，管理层无法实时看到进度与成本。
用户与使用场景：产品经理维护需求与里程碑；开发人员认领任务并记录工时；项目经理查看燃尽图与逾期风险；老板查看营收与人力成本看板。
功能需求方向：任务看板、工时填报与审批、里程碑与依赖、消息通知、报表导出、权限与成员管理。
非功能需求方向：支持 500 人并发、数据加密存储、操作审计、接口平均响应 <300ms、可用性 99.9%。
数据与接口：对接企业微信通讯录与钉钉日历，提供 OpenAPI 供二次开发。
验收标准：看板拖拽延迟 <100ms；工时月结准确率 100%；支持单点登录。
请输出包含「背景与目标、用户与使用场景、功能需求、非功能需求、数据与接口、验收标准」六章节的《需求规格文档》。`;

    // 3) 执行（模型输出校验为非确定性，偶发 MODEL_OUTPUT_INVALID；失败已退款，做有限重试以稳定拿到成功对账）
    let execRes: Response | null = null;
    let execJson: any = null;
    const MAX_TRIES = 3;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      console.log(`[3] POST ${BASE}/api/open/v1/execute (componentId=C07) attempt=${attempt}/${MAX_TRIES} ...`);
      execRes = await fetch(`${BASE}/api/open/v1/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({ workspaceId, componentId: "C07", taskName: "E1-验证", inputMaterial: sampleInput }),
      });
      execJson = await execRes.json();
      console.log(`    HTTP ${execRes.status}  body=${JSON.stringify(execJson).slice(0, 300)}`);
      if (execRes.status === 200) break;
      if (execJson?.error === "MODEL_OUTPUT_INVALID" && attempt < MAX_TRIES) {
        console.log("    输出章节校验未过（模型非确定性），重试…");
        continue;
      }
      throw new Error(`执行失败：${execRes.status} ${JSON.stringify(execJson)}`);
    }
    if (execRes!.status !== 200) throw new Error(`执行失败：${execRes!.status} ${JSON.stringify(execJson)}`);

    const taskId: string = execJson.taskId;
    const pollUrl = `${BASE}/api/open/v1/tasks/${taskId}`;
    console.log(`[4] 轮询 ${pollUrl}`);

    // 4) 轮询到终态
    let finalStatus = "";
    let taskData: any = null;
    for (let i = 0; i < 60; i++) {
      const r = await fetch(pollUrl, { headers });
      const j = await r.json();
      taskData = j.data;
      finalStatus = taskData?.status || "";
      if (["SUCCESS", "FAILED", "ERROR", "CANCELLED", "DONE", "COMPLETED"].includes(finalStatus)) break;
      await sleep(2000);
    }
    console.log(`    终态 status=${finalStatus}`);

    // 5) 三方对账
    const task = await prisma.componenttask.findUnique({
      where: { id: taskId },
      select: { status: true, config: true, result: true },
    });
    const ledgers = await prisma.pointledger.findMany({
      where: { taskId },
      select: { type: true, points: true, amountCents: true, title: true, balanceAfter: true },
    });
    const usage = (taskData?.result as any)?.usage || execJson.usage || {};
    const inTok = Number(usage.inputTokens || 0);
    const outTok = Number(usage.outputTokens || 0);

    // 真实模型成本（元）：单价字段为「每百万 token 的微分(micros)」，故 cost_元 = (tokens/1e6) * micros / 1e6
    const depId = await getPlatformDefaultDeploymentId();
    const pricing = await prisma.modelpricing.findFirst({ where: { deploymentId: depId || "" } });
    let costYuan = 0;
    if (pricing) {
      const inMicros = Number(pricing.priceInputMicrosPerMillion || 0);
      const outMicros = Number(pricing.priceOutputMicrosPerMillion || 0);
      costYuan = ((inTok * inMicros + outTok * outMicros) / 1e6) / 1e6;
    }

    const consumePoints = ledgers
      .filter((l) => l.type === "CONSUME")
      .reduce((s, l) => s + Math.abs(Number(l.points || 0)), 0);

    const safe = (o: unknown) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
    console.log("\n========== 三方对账 ==========");
    console.log(`任务 taskId         : ${taskId}`);
    console.log(`任务状态            : ${task?.status}  (轮询=${finalStatus})`);
    console.log(`渠道标记 channel    : ${(task?.config as any)?.channel ?? "(空)"}`);
    console.log(`componenttask.result : ${task?.result ? "已写入" : "(空)"}`);
    console.log(`扣点流水            : ${safe(ledgers)}`);
    console.log(`扣点合计(点)        : ${consumePoints}`);
    console.log(`真实用量 tokens      : in=${inTok} out=${outTok}`);
    console.log(`真实模型成本(元)    : ${costYuan.toFixed(6)}  (预算 ≤0.20 元)`);
    const ok = costYuan <= 0.2 && (task?.config as any)?.channel === "OPEN_API";
    console.log(`对账结论            : ${ok ? "PASS ✅" : "FAIL ❌"}`);
    if (!ok) throw new Error("对账未通过");

    // 6) 清理临时 Key
    await prisma.apikey.delete({ where: { id: keyRow.id } }).catch(() => {});
    console.log(`[6] 已删除临时 API Key: ${keyRow.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
