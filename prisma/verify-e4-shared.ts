/**
 * COMPONENT-EXPANSION-E4 共享模块（验证专用，绝不改任何合同/代码/共享层）。
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
export const E4_FILES: Record<string, { content: string; filename: string; mime: string }> = {
  C46: {
    filename: "user-api.ts",
    mime: "text/plain",
    content:
      "import { Controller, Get, Post, Param, Body } from '@nestjs/common';\n" +
      "import { UserService } from './user.service';\n\n" +
      "@Controller('users')\n" +
      "export class UserController {\n" +
      "  constructor(private readonly svc: UserService) {}\n" +
      "  @Get() findAll() { return this.svc.findAll(); }\n" +
      "  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }\n" +
      "  @Post() create(@Body() dto: CreateUserDto) { return this.svc.create(dto); }\n" +
      "}\n" +
      "// prisma model: model User { id String @id @default(cuid()) email String @unique name String role String }\n",
  },
  C47: {
    filename: "obscure.ts",
    mime: "text/plain",
    content:
      "// 晦涩嵌套：尾递归 + 闭包缓存的奇怪写法\n" +
      "function weird(n: number, memo: Record<number, number> = {}): number {\n" +
      "  if (n < 2) return n;\n" +
      "  if (memo[n]) return memo[n];\n" +
      "  memo[n] = weird(n - 1, memo) + weird(n - 2, memo);\n" +
      "  return memo[n];\n" +
      "}\n" +
      "// 嵌套三元 + IIFE 难读\n" +
      "const classify = (x: number) => (x > 0 ? (x > 10 ? 'big' : 'mid') : (x === 0 ? 'zero' : 'neg'));\n" +
      "export { weird, classify };\n",
  },
  C48: {
    filename: "deploy-runbook.md",
    mime: "text/plain",
    content:
      "# 订单服务部署手册\n" +
      "## 环境准备\n- 申请 K8s namespace: order-prod\n- 配置 Secret: DATABASE_URL, REDIS_URL\n" +
      "## 发布步骤\n1. 构建镜像: docker build -t order-svc:1.2.0 .\n" +
      "2. 推送: docker push registry.local/order-svc:1.2.0\n3. 应用: kubectl apply -f deploy.yaml\n" +
      "## 回滚\nkubectl rollout undo deployment/order-svc -n order-prod\n" +
      "## 健康检查\nGET /healthz 返回 200 即就绪\n",
  },
  C50: {
    filename: "order-fix.diff",
    mime: "text/plain",
    content:
      "diff --git a/src/order.service.ts b/src/order.service.ts\n" +
      "index aaa..bbb 100644\n--- a/src/order.service.ts\n+++ b/src/order.service.ts\n" +
      "@@ -10,7 +10,7 @@\n" +
      "   async createOrder(dto: CreateOrderDto) {\n" +
      "-    const existing = await this.repo.findOne({ where: { id: dto.id } });\n" +
      "-    if (existing) throw new ConflictException();\n" +
      "+    // BUG: 缺少幂等校验，重复提交会创建重复订单\n" +
      "     return this.repo.save(dto);\n" +
      "   }\n",
  },
  C53: {
    filename: "defects.md",
    mime: "text/plain",
    content:
      "# 历史故障记录\n" +
      "- 2026-03: 订单服务因未开启事务，部分扣减成功部分失败，造成金额不一致\n" +
      "- 2026-05: 数据库连接串明文写在代码仓库，被内部扫描发现\n" +
      "- 2026-06: 拼接 SQL 导致报表接口被注入，拖垮主库\n" +
      "- 2026-07: 缓存与数据库双写不一致，展示旧库存导致超卖\n",
  },
};

export const E4_TEXT: Record<string, string> = {
  C49:
    "我们项目的部署命令是什么？前端如何配置灰度发布的流量比例？目前用 Nginx + K8s，Ingress 控制权重。",
  C51:
    "单体订单服务耦合严重，订单与库存互相阻塞；峰值 5000 QPS 时接口超时，希望解耦并提升并发能力。",
  C52:
    "内部 CRM 工具，峰值 2000 QPS，团队熟悉 Node.js 与 React，预算有限，希望快速上线且易维护。",
  C54:
    "一个订单服务，Controller 直接串行调用 3 个下游（库存/支付/通知）且无超时与降级，代码与契约偏离度高。",
  C55:
    "目标 K8s 集群，环境变量含 DATABASE_URL 与 REDIS_URL，需灰度 10% 流量再全量，要求构建后自动跑单元测试。",
  C56:
    "OpenAPI：GET /users 返回用户列表；POST /users 创建用户（字段 name,email,age）；GET /users/:id 查询单个用户。",
  C57:
    "源码：const dbUrl = 'postgres://admin:Admin123@db:5432/app'; 依赖：lodash 4.17.15, axios 0.21.1, jsonwebtoken 8.5.1。",
  C58:
    "PRD：用户可注册登录、发布商品、下单支付、查看订单状态、申请退款；覆盖 Web 端与移动端。",
  C59:
    "待测试模块：order-service 的创建订单/查询/取消接口，含并发创建与超时回滚路径。",
  C60:
    "开放「创建订单」与「查询订单状态」两个接口，需 JWT 鉴权、全局限流 100 QPS、统一响应结构（code/message/data）。",
};

export async function createFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_e4_${s}`;
  const workspaceId = `ws_e4_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `e4_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.tenant.create({ data: { id: workspaceId, name: `e4 租户 ${s}`, updatedAt: new Date() } });
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
  const fileDef = E4_FILES[componentId];
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
        taskName: `${componentId} E4 真实验收`,
        inputSource: { sourceType: "text" },
        inputMaterial: isFailure ? bust() : E4_TEXT[componentId],
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
