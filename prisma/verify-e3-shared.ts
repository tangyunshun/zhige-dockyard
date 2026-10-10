/**
 * COMPONENT-EXPANSION-E3 共享模块（验证专用，绝不改任何合同/代码/共享层）。
 *
 * 重要：src/lib/model-adapter.ts 在「模块加载期」冻结 MODEL_TIMEOUT_MS 为常量。
 * 因此调用方必须在「动态 import 本模块之前」设置 process.env.MODEL_TIMEOUT_MS，
 * 否则超时值不会生效（这是 E2-FIX 失败抽样未真触发超时的根因）。
 *   - 主验证器：import 前设 MODEL_TIMEOUT_MS=180000（成功路径）
 *   - 失败抽样子进程：import 前设 MODEL_TIMEOUT_MS=1（强制超时）
 *
 * 本模块只做验证：建隔离账号、真实登录、真实估价、真实执行、三方对账。
 * 不清理任何数据——任务/流水/账号全部保留，供审核方直接查库核对。
 */
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import { prisma } from "../src/lib/prisma";
import { POST as studioPostRoute } from "../src/app/api/studio/route";
import { GET as estimateGetRoute } from "../src/app/api/billing/estimate/route";
export { prisma } from "../src/lib/prisma";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

export const YUAN_PER_POINT = 0.01;

export async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

// —— 真实业务素材（差异化，贴合各组件语义）——
export const E3_FILES: Record<string, { content: string; filename: string; mime: string }> = {
  C36: {
    filename: "orders.ts",
    mime: "text/plain",
    content:
      "export async function getUserOrders(db: any, userId: string, status: string) {\n" +
      "  // 缺陷：字符串拼接构造 SQL，存在 SQL 注入风险\n" +
      "  const sql = `SELECT * FROM orders WHERE user_id = '${userId}' AND status = '${status}'`;\n" +
      "  return db.query(sql);\n" +
      "}\n" +
      "export async function createOrder(db: any, userId: string, items: string) {\n" +
      "  // 缺陷：未参数化拼接\n" +
      "  const sql = \"INSERT INTO orders(user_id, items) VALUES('\" + userId + \"','\" + items + \"')\";\n" +
      "  return db.query(sql);\n" +
      "}",
  },
  C37: {
    filename: "board.html",
    mime: "text/html",
    content:
      "<!DOCTYPE html>\n<html><head><title>留言板</title></head>\n<body>\n" +
      '  <div id="comments"></div>\n' +
      '  <input id="nick" placeholder="昵称" />\n' +
      '  <textarea id="msg"></textarea>\n' +
      '  <button onclick="post()">提交</button>\n' +
      "  <script>\n" +
      "    function post(){\n" +
      "      var nick = document.getElementById('nick').value;\n" +
      "      var msg = document.getElementById('msg').value;\n" +
      "      // 缺陷：未转义直接 innerHTML 注入，且 Cookie 未设 HttpOnly\n" +
      "      document.getElementById('comments').innerHTML += '<p>'+nick+': '+msg+'</p>';\n" +
      "      document.cookie = 'session=abc123';\n" +
      "    }\n" +
      "  </script>\n</body></html>",
  },
  C38: {
    filename: "package.json",
    mime: "application/json",
    content: JSON.stringify(
      {
        name: "demo-web",
        version: "1.4.2",
        dependencies: {
          lodash: "4.17.15",
          axios: "0.21.1",
          express: "4.18.2",
          minimist: "1.2.5",
          jsonwebtoken: "8.5.1",
        },
        devDependencies: { jest: "26.6.3" },
      },
      null,
      2,
    ),
  },
  C45: {
    filename: "closure.md",
    mime: "text/plain",
    content:
      "# 订单中心 v2.0 结项材料\n" +
      "## 交付版本\n- 订单服务 v2.0.1\n- 支付回调 v1.3.0\n- 管理后台 v2.0.0\n" +
      "## 测试大纲\n- 单元覆盖 82%\n- 接口回归 210 用例\n- 压测 P99 < 200ms\n" +
      "## 缺陷统计\n- 总数 47，已修复 44，遗留 3（均为低危 UI 错位，已评估可接受）",
  },
};

export const E3_TEXT: Record<string, string> = {
  C32:
    "将 Node.js 订单服务部署到 Kubernetes：常态 3 个副本，CPU 使用率超 70% 时自动扩容至最多 10 副本，最小 2 副本；" +
    "就绪探针检测 /healthz，存活探针检测 /livez；滚动更新最大不可用 1 个。",
  C33:
    "GitHub 仓库（main 分支）的 Node.js 项目，目标部署到自建 K8s 集群。提交后自动执行：npm ci → npm run build → " +
    "安全扫描(npm audit) → 构建镜像推送私有 registry → 灰度发布 10% 流量再全量。",
  C34:
    "监控订单服务：CPU 使用率 > 90% 持续 5 分钟、内存 > 85%、HTTP 5xx 率 > 1% 时触发告警；" +
    "通过企业微信群机器人 webhook 与运维邮箱通知 oncall 组；持续 10 分钟未恢复升级值班经理。",
  C35:
    "通过 Filebeat 收集 8 台应用服务器的 /var/log/app/*.log 与 Nginx access.log，统一写入 Elasticsearch（按 service/level/host 建索引与 ILM 90 天）；" +
    "需支持检索：错误栈、5xx、P99 耗时、按服务聚合。",
  C39:
    "等保三级。系统前后端分离：Nginx + 云上 RDS(MySQL) + 对象存储 OSS + Redis；对外 Web 门户与管理后台，用户手机号+短信验证码登录，" +
    "管理后台仅内网可达；含订单、支付回调与敏感 PII 存储。",
  C40:
    "脱敏规则：手机号保留前三后四（138****8000）；身份证保留前 6 后 4（110101********1234）；银行卡保留后 4（****1234）；" +
    "姓名保留姓氏打码（张*）。提供后端 Node 与前端的脱敏函数，并说明密钥与防泄漏策略。",
  C41:
    "3 个月上线电商小程序。阶段交付物：需求评审、UI 设计稿、前后端开发、联调测试、灰度发布、正式上线；" +
    "各阶段含若干工作包（后端含订单/支付/商品三个服务）。",
  C42:
    "任务与依赖：需求分析(3d) → UI 设计(5d) 并行后端开发(12d) 并行前端开发(12d) → 联调(4d,依赖前后端) → " +
    "测试(5d,依赖联调) → 灰度(2d,依赖测试) → 上线(1d,依赖灰度)。",
  C43:
    "8 人团队（前端2、后端3、测试1、产品1、设计1），ToB SaaS 项目，合同要求 6 个月内交付 v1.0，" +
    "含大量第三方支付与短信集成，客户验收标准严格。",
  C44:
    "前端 2 人 × 40h、后端 3 人 × 40h、测试 1 人 × 40h、设计 1 人 × 40h。任务：需求开发A(120h)、需求开发B(80h)、" +
    "支付集成(60h)、测试执行(60h)、UI 设计(40h)。",
};

export async function createFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_e3_${s}`;
  const workspaceId = `ws_e3_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `e3_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.tenant.create({ data: { id: workspaceId, name: `e3 租户 ${s}`, updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER" } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({
    data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" },
  });
  return { userId, workspaceId, token: await token(userId) };
}

export async function refreshActivity(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { lastActivityAt: new Date() } });
}

export async function estimate(componentId: string, workspaceId: string, tk: string) {
  const req = new NextRequest(
    `http://localhost/api/billing/estimate?componentId=${componentId}&workspaceId=${workspaceId}`,
    { method: "GET", headers: { Authorization: `Bearer ${tk}` } },
  );
  const res = await estimateGetRoute(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

export async function execute(componentId: string, workspaceId: string, tk: string, isFailure: boolean) {
  let req: NextRequest;
  const bust = () => (isFailure ? ` RAND ${randomUUID()} ${randomUUID()}` : "");
  const fileDef = E3_FILES[componentId];
  if (fileDef) {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `${bust()}\n${fileDef.content}` : fileDef.content;
    form.append("file", new Blob([content], { type: fileDef.mime }), fileDef.filename);
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else {
    req = new NextRequest("http://localhost/api/studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "simulate",
        componentId,
        workspaceId,
        taskName: `${componentId} E3 真实验收`,
        inputSource: { sourceType: "text" },
        inputMaterial: isFailure ? bust() : E3_TEXT[componentId],
      }),
    });
  }
  const res = await studioPostRoute(req);
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

export function extractTaskId(json: Record<string, unknown>): string | null {
  const t = json.task as Record<string, unknown> | undefined;
  return (
    (t?.id as string | undefined) ??
    (json.taskId as string) ??
    ((json.data as Record<string, unknown> | undefined)?.taskId as string) ??
    ((json.data as Record<string, unknown> | undefined)?.id as string) ??
    null
  );
}
export function extractStatus(json: Record<string, unknown>): string | null {
  const t = json.task as Record<string, unknown> | undefined;
  return (t?.status as string) ?? (json.status as string) ?? ((json.data as Record<string, unknown> | undefined)?.status as string) ?? null;
}
export function extractCode(json: Record<string, unknown>): string | null {
  return (json.code as string) ?? ((json.data as Record<string, unknown> | undefined)?.code as string) ?? (json.errorCode as string) ?? null;
}
export function extractArtifactPreview(task: { result?: unknown } | null): { preview: string; jsonValid: boolean } {
  if (!task || !task.result) return { preview: "", jsonValid: false };
  const result = task.result as Record<string, unknown>;
  const text = typeof result === "string" ? result : JSON.stringify(result);
  let jsonValid = false;
  try {
    JSON.parse(text);
    jsonValid = true;
  } catch {
    jsonValid = false;
  }
  return { preview: text.slice(0, 200), jsonValid };
}

export async function readTask(taskId: string | null) {
  if (!taskId) return null;
  return prisma.componenttask.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, config: true, result: true },
  });
}

export async function readLedger(userId: string, taskId?: string | null) {
  const rows = await prisma.pointledger.findMany({
    where: { userId, ...(taskId ? { taskId } : {}), type: { in: ["CONSUME", "REFUND"] } },
  });
  let consume = 0;
  let refund = 0;
  for (const r of rows) {
    const v = Number(r.points);
    if (r.type === "CONSUME") consume += v;
    else refund += v;
  }
  return { consume, refund, net: consume - refund, count: rows.length };
}

export function isTimeoutCode(code: string | null) {
  return !!code && (code.includes("TIMEOUT") || code.includes("MODEL_TIMEOUT"));
}
export function isProviderError(code: string | null) {
  return !!code && code.includes("UPSTREAM_ERROR");
}
export function isQualityFailure(code: string | null) {
  return !!code && (code.includes("OUTPUT_INVALID") || code.includes("OUTPUT_VALIDATION") || code.includes("VALIDATION_FAILED"));
}
