/**
 * E2-FIX-R 共享模块（验证专用，绝不改任何合同/代码/共享层）。
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

// 换算唯一真源：1 算力点 = 0.01 元
export const YUAN_PER_POINT = 0.01;

export async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

// —— 真实业务素材（差异化，贴合各组件语义）——
export const C20_SQL = `CREATE TABLE \`user\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`name\` VARCHAR(64) NOT NULL,
  \`email\` VARCHAR(128) NOT NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_email\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE \`order\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`user_id\` BIGINT UNSIGNED NOT NULL,
  \`amount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  \`status\` VARCHAR(20) NOT NULL DEFAULT 'NEW',
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  KEY \`idx_user\` (\`user_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE \`order_item\` (
  \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`order_id\` BIGINT UNSIGNED NOT NULL,
  \`sku\` VARCHAR(64) NOT NULL,
  \`qty\` INT NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id\`),
  KEY \`idx_order\` (\`order_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`;

export const C24_JSON = JSON.stringify({
  title: "2026 各月销售额",
  unit: "万元",
  months: ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月"],
  values: [128, 142, 165, 153, 178, 201, 196, 220],
});

export const C26_SRC = `export function formatCurrency(amount: number, currency = "CNY"): string {
  if (!Number.isFinite(amount)) throw new Error("amount must be a finite number");
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency }).format(amount);
}
export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new Error("min must not exceed max");
  return Math.min(Math.max(value, min), max);
}`;

export const C27_OPENAPI = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "订单中心 API", version: "2.1.0" },
  servers: [{ url: "https://api.shop.example.com/v2" }],
  paths: {
    "/orders": {
      get: {
        summary: "分页查询订单",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 } },
          { name: "status", in: "query", schema: { type: "string", enum: ["NEW", "PAID", "SHIPPED", "DONE"] } },
        ],
        responses: { "200": { description: "订单列表" } },
      },
      post: {
        summary: "创建订单",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer" } }, required: ["sku", "qty"] },
            },
          },
        },
        responses: { "201": { description: "已创建" } },
      },
    },
    "/orders/{id}": {
      get: {
        summary: "订单详情",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "订单详情" } },
      },
    },
  },
});

export const C29_SRC = `export function divide(a: number, b: number): number {
  return a / b; // 缺陷：未处理 b === 0 的除零
}
export function parseConfig(json: string): any {
  return JSON.parse(json); // 缺陷：未捕获解析异常，非法 JSON 会抛错
}
export function formatUser(u: { id: number; name?: string }): string {
  return \`\${u.id}-\${u.name.toUpperCase()}\`; // 缺陷：name 可能 undefined 导致 toUpperCase 崩溃
}`;

export const TEXT_INPUT: Record<string, string> = {
  C21:
    "生成一个「团队任务看板」React + TypeScript 页面：顶部导航含搜索框与「新建任务」按钮；主体三列看板（待办/进行中/已完成），" +
    "每列卡片显示任务标题、负责人头像、截止日期与优先级标签；卡片支持拖拽跨列；底部分页每页 20 条；" +
    "数据字段来自 /api/tasks 的 {id,title,assignee,dueDate,priority,status}。",
  C22:
    "生成一个 Vue3 + <script setup> 的「商品评价列表」组件：props 接收 reviews 数组（{user, avatar, rating, content, createdAt}）；" +
    "展示星级（rating 转 5 颗星，支持半星）、用户头像圆角、评价内容多行省略（超 3 行展开）；" +
    "顶部按评分降序排序并提供「有图/全部」筛选；使用 Pinia 管理点赞状态。",
  C23:
    "为「企业官网首页」生成响应式 CSS：桌面端（≥1200px）顶部通栏导航 + 三栏内容（左 240px 侧边栏、中自适应文章流、右 300px 热门榜）；" +
    "平板（768–1199px）导航折叠为汉堡菜单、两栏（隐藏右栏）；手机（<768px）单栏堆叠、导航变为底部 Tab Bar；断点用 min-width 媒体查询。",
  C25:
    "生成一个「电商实时经营大屏」：顶部 6 个 KPI 卡片（GMV、订单数、支付转化率、客单价、退款率、在线人数）；" +
    "中部左侧实时交易折线图、右侧中国地图热力；底部 TOP10 商品排行榜带进度条；整体深色科技风、霓虹蓝主色；" +
    "数据每 5 秒通过 /api/realtime 轮询刷新。",
  C28:
    "对「秒杀系统」做压测方案：架构为 Nginx + 8 台应用（Spring Boot）+ Redis 集群 + MySQL 主从；" +
    "压测目标峰值 10 万 QPS 创建订单，阶梯加压 1万→10万，单场景持续 10 分钟；关注 P99 创建耗时 ≤ 200ms、错误率 ≤ 0.1%、Redis 命中率 ≥ 95%；" +
    "给出 JMeter 线程组与 Constant Throughput Timer 配置要点。",
  C30:
    "为「生鲜电商 Web 端」设计端到端自动化测试脚本（Playwright）：1) 访问首页，点击「登录」用 test@shop.com / Passw0rd 登录；" +
    "2) 在搜索框输入「有机牛奶」回车；3) 点击结果第一个商品进入详情页，断言价格可见；4) 点击「加入购物车」，断言角标 +1；" +
    "5) 进入购物车点击「去结算」，选择默认地址，提交订单；6) 断言订单详情页出现「下单成功」与 18 位订单号。",
  C31:
    "将「Node 后端服务」打包为多阶段 Docker 镜像：基础镜像 node:18-alpine；第一阶段 npm ci && npm run build；" +
    "第二阶段仅拷贝 package*.json 与 dist、生产依赖（prisma 用 prisma generate --production），不含 devDependencies；" +
    "启动时先 prisma migrate deploy 再 node dist/main.js；暴露 3000 端口；用 alpine 减小体积。",
};

export async function createFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_e2fr_${s}`;
  const workspaceId = `ws_e2fr_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `e2fr_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.tenant.create({ data: { id: workspaceId, name: `e2fr 租户 ${s}`, updatedAt: new Date() } });
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
  if (componentId === "C20") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `${C20_SQL}\n--${bust()}` : C20_SQL;
    form.append("file", new Blob([content], { type: "application/sql" }), "src.sql");
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C24") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    form.append("file", new Blob([C24_JSON], { type: "application/json" }), "data.json");
    if (isFailure) form.append("inputMaterial", bust());
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C26") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `${bust()}\n${C26_SRC}` : C26_SRC;
    form.append("file", new Blob([content], { type: "text/plain" }), "src.ts");
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C27") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    form.append("file", new Blob([C27_OPENAPI], { type: "application/json" }), "openapi.json");
    if (isFailure) form.append("inputMaterial", bust());
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else if (componentId === "C29") {
    const form = new FormData();
    form.append("action", "simulate");
    form.append("componentId", componentId);
    form.append("workspaceId", workspaceId);
    form.append("inputSource", JSON.stringify({ sourceType: "file" }));
    const content = isFailure ? `${bust()}\n${C29_SRC}` : C29_SRC;
    form.append("file", new Blob([content], { type: "text/plain" }), "src.ts");
    req = new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: form });
  } else {
    req = new NextRequest("http://localhost/api/studio", {
      method: "POST",
      headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "simulate",
        componentId,
        workspaceId,
        taskName: `${componentId} E2FIX-R 真实验收`,
        inputSource: { sourceType: "text" },
        inputMaterial: isFailure ? bust() : TEXT_INPUT[componentId],
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
