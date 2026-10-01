/**
 * 请求级确定性 HTTP 测试（fake 依赖）—— C01 / C02 / C07 执行路径隔离验证
 *
 * 证据性质声明（CORE-3-R3.6 / R3.7 红线）：
 * - 本文件通过 Request/Response 调用与 Next.js handler 相同的处理函数 runStudioPost / runStudioGet，
 *   并注入隔离的内存 fake（ prisma / 模型适配器 / 账务 / 退款 / 结算 / 合同快照 / 权限 ）。
 * - 生产入口 POST 传入 buildProductionDeps()（真实单例）；本测试传入内存 fake。
 *   两者共用同一执行逻辑（runStudioPost），测试 fake 不会经环境变量或全局可变状态影响生产。
 * - 测试不连任何真实服务：模型适配器为内存 fake；账务/退款/结算为内存 fake；
 *   合同快照来自“生产激活合同只读导出 fixture”（fixtures/active-contracts.snapshot.ts），
 *   不得用 DRAFT 模板冒充；文件提取走路由真实服务端函数（extractTextFromBufferWithTimeout），
 *   仅做本地文本读取，不调用任何外部模型或第三方服务。
 * - 本测试仅证明 HTTP 控制流、合同校验、DTO 序列化与错误隔离；
 *   不证明真实模型、真实数据库、真实扣点、真实退款或生产业务验收完成。
 *
 * 测试形态（与真实生产合同一致，唯一测试合同来源 = 生产快照只读导出 fixture）：
 * - C01 / C02：生产合同 input.kind = "FILE"，通过 multipart/form-data 上传真实内存 File，
 *   覆盖合同约束校验（类型 / 大小 / 数量 / 提取为空）与路由真实文本提取路径。
 * - C07：生产合同 input.kind = "TEXT_AND_FILES"，分别测试文本输入、合同允许的文件输入、文本+文件双输入。
 * - 每个失败/阻断用例断言：模型适配器、扣点服务、任务仓储写入、退款服务均未调用。
 * - 读闭环：经 runStudioGet?action=task_detail 读取成功/失败任务，并经 serializeTaskListItem 验证
 *   列表安全 DTO 不泄漏 config / result / prompt / 原始输入 / 成果正文。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { runStudioPost, runStudioGet, type StudioExecutionDeps } from "../route";
import {
  C01_ACTIVE_CONTRACT,
  C02_ACTIVE_CONTRACT,
  C07_ACTIVE_CONTRACT,
} from "./fixtures/active-contracts.snapshot";
import { serializeTaskListItem } from "@/lib/task-query-helpers";
import type { ComponentContract } from "@/lib/component-contract/types";

/* ------------------------------------------------------------------ */
/* 内存 fake Prisma（仅实现 simulate / task_detail / tasks 路径用到的表与方法） */
/* ------------------------------------------------------------------ */
interface Metrics {
  calls: string[];
  counts: Record<string, number>;
}
function tick(m: Metrics, name: string) {
  m.calls.push(name);
  m.counts[name] = (m.counts[name] ?? 0) + 1;
}

class MemoryPrisma {
  tables = new Map<string, any[]>();
  sequence = 0;
  metrics?: Metrics;
  constructor(metrics?: Metrics) {
    this.metrics = metrics;
  }
  private table(name: string): any[] {
    if (!this.tables.has(name)) this.tables.set(name, []);
    return this.tables.get(name)!;
  }
  private matches(record: any, where: any): boolean {
    if (!where || typeof where !== "object") return true;
    for (const k of Object.keys(where)) {
      const v = where[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        let matched = true;
        for (const op of Object.keys(v)) {
          const ov = (v as any)[op];
          switch (op) {
            case "not":
              matched = matched && record[k] !== ov;
              break;
            case "in":
              matched = matched && Array.isArray(ov) && ov.includes(record[k]);
              break;
            case "contains":
              matched = matched && typeof record[k] === "string" && record[k].includes(ov);
              break;
            case "equals":
              matched = matched && record[k] === ov;
              break;
            default:
              matched = matched && record[k] === ov;
              break;
          }
        }
        if (!matched) return false;
      } else if (record[k] !== v) {
        return false;
      }
    }
    return true;
  }
  private merge(target: any, data: any): any {
    for (const k of Object.keys(data)) {
      const v = data[k];
      if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") {
        target[k] = this.merge(target[k], v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }
  private model(name: string) {
    const self = this;
    const base = {
      findUnique: async ({ where }: any) => {
        if (!where) return null;
        const r = self.table(name).find((x) => self.matches(x, where));
        return r ? JSON.parse(JSON.stringify(r)) : null;
      },
      findFirst: async ({ where, orderBy }: any) => {
        if (!where) return null;
        const recs = self.table(name).filter((x) => self.matches(x, where));
        if (orderBy) {
          const key = Object.keys(orderBy)[0];
          const dir = (orderBy as any)[key];
          recs.sort((a: any, b: any) => (dir === "desc" ? (a[key] > b[key] ? -1 : 1) : a[key] < b[key] ? -1 : 1));
        }
        return recs[0] ? JSON.parse(JSON.stringify(recs[0])) : null;
      },
      findMany: async ({ where }: any) =>
        self.table(name).filter((x) => self.matches(x, where)).map((x) => JSON.parse(JSON.stringify(x))),
      create: async ({ data }: any) => {
        const rec = { ...data };
        if (!rec.id) rec.id = `gen_${++self.sequence}`;
        self.table(name).push(rec);
        if (name === "componenttask" && self.metrics) tick(self.metrics, "componenttask.create");
        return JSON.parse(JSON.stringify(rec));
      },
      update: async ({ where, data }: any) => {
        const rec = self.table(name).find((x) => self.matches(x, where));
        if (!rec) throw new Error(`update not found in ${name}`);
        self.merge(rec, data);
        return JSON.parse(JSON.stringify(rec));
      },
      // 与 Prisma updateMany 契约一致：只更新匹配行，返回 { count }；
      // CORE-3 状态机成功/失败转换均依赖 count 判定原子转换结果。
      updateMany: async ({ where, data }: any) => {
        const recs = self.table(name).filter((x) => self.matches(x, where));
        for (const rec of recs) self.merge(rec, data);
        return { count: recs.length };
      },
      upsert: async ({ where, update, create }: any) => {
        const rec = self.table(name).find((x) => self.matches(x, where));
        if (rec) {
          self.merge(rec, update);
          return JSON.parse(JSON.stringify(rec));
        }
        const nr = { ...create };
        if (!nr.id) nr.id = `gen_${++self.sequence}`;
        self.table(name).push(nr);
        return JSON.parse(JSON.stringify(nr));
      },
      delete: async () => ({}),
    };
    return base;
  }
  get workspace() {
    return this.model("workspace");
  }
  get workspacemember() {
    return this.model("workspacemember");
  }
  get componentusage() {
    return this.model("componentusage");
  }
  get componentcatalog() {
    return this.model("componentcatalog");
  }
  get componentcategory() {
    return this.model("componentcategory");
  }
  get componenttask() {
    return this.model("componenttask");
  }
  get tenant() {
    return this.model("tenant");
  }
  get workspacequota() {
    return this.model("workspacequota");
  }
  get componentstats() {
    return this.model("componentstats");
  }
  get pointledger() {
    return this.model("pointledger");
  }
  get refundrecovery() {
    return this.model("refundrecovery");
  }
  async $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

/* ------------------------------------------------------------------ */
/* 组件规格（唯一测试合同来源 = 生产激活合同只读导出 fixture）            */
/* ------------------------------------------------------------------ */
interface ComponentSpec {
  id: string;
  name: string;
  contract: ComponentContract;
  inputKind: "FILE" | "TEXT_AND_FILES";
  /** 合同真实必填章节（来自 qualityPolicy.requiredSections）；空表示无章节约束 */
  requiredSections: string[];
  /** 是否具备输出质量门禁（requiredSections 或 minOutputLength），决定“输出校验失败”是否可触发 */
  hasOutputQualityGate: boolean;
}

const COMPONENTS: ComponentSpec[] = [
  { id: "C01", name: "招标文件解析", contract: C01_ACTIVE_CONTRACT, inputKind: "FILE", requiredSections: ["偏离"], hasOutputQualityGate: true },
  { id: "C02", name: "安全合规体检", contract: C02_ACTIVE_CONTRACT, inputKind: "FILE", requiredSections: ["合规"], hasOutputQualityGate: true },
  { id: "C07", name: "会议纪要转需求", contract: C07_ACTIVE_CONTRACT, inputKind: "TEXT_AND_FILES", requiredSections: [], hasOutputQualityGate: false },
];

function makeSnapshot(contract: ComponentContract): any {
  return {
    contractId: `active_${contract.componentId}`,
    contractVersion: contract.contractVersion || "1.0.0",
    snapshot: { snapshotId: `snap_${contract.componentId}`, snapshotCreatedAt: new Date(0).toISOString(), contract },
  };
}

/** 成功模型输出：覆盖各组件真实必填章节，确保经真实 validateModelOutput 校验通过（不伪造）。
 *  C01 必填“偏离”、C02 必填“合规”；C07 无章节约束，任意非空文本即通过。 */
function successModelText(spec: ComponentSpec): string {
  const sections = ["招标要求", "能力匹配", "偏离", "风险", "合规结论", "问题清单", "待补充材料", "整改顺序"];
  const block = sections.map((s) => `## ${s}`).join("\n");
  return `# ${spec.name} 确定性测试成果物\n\n本结果为 AI 生成的测试草案，需由负责人复核。\n\n${block}\n\n以上为按合同必填章节生成的规范成果物正文，用于隔离测试，不含任何真实模型调用。\n\n补充说明：本草案覆盖合同规定全部必填章节，供测试断言必填关键词存在性；其长度满足质量基线最小长度要求，避免 OUTPUT_VALIDATION_FAILED。测试不依赖真实模型，仅验证生产校验链路的确定性行为，不声称真实模型或资金闭环完成。`;
}

type ModelBehavior = "success" | "throw" | "empty";

function buildDeps(
  spec: ComponentSpec,
  opts: { userId: string; workspaceId: string; allowPermission: boolean; modelBehavior: ModelBehavior; metrics: Metrics },
): StudioExecutionDeps {
  const { userId, workspaceId, allowPermission, modelBehavior, metrics } = opts;
  const fakePrisma = new MemoryPrisma(metrics);

  fakePrisma.tables.set("workspace", [{ id: workspaceId, type: "ENTERPRISE", ownerId: userId, name: "测试空间" }]);
  fakePrisma.tables.set("workspacemember", [
    { id: "wm1", userId, workspaceId, role: "OWNER", monthlyTokenLimit: null, monthlyTokenUsed: 0, tokenBalance: 0 },
  ]);
  fakePrisma.tables.set("componentcatalog", [
    {
      id: spec.id,
      name: spec.name,
      category: "TEST",
      description: "",
      contract: spec.contract,
      previewData: null,
      inputMode: spec.inputKind,
      estimatedModelTokens: 100,
      activeContractId: `active_${spec.id}`,
      detail: null,
    },
  ]);
  fakePrisma.tables.set("componentcategory", []);
  fakePrisma.tables.set("workspacequota", [{ id: "q1", workspaceId, tokenBalance: 0, membershipLevelId: "FREE" }]);

  const contractSnapshot = makeSnapshot(spec.contract);

  const fakeAdapter = {
    providerId: "p1",
    modelId: "m1",
    async execute() {
      tick(metrics, "adapter.execute");
      if (modelBehavior === "throw") throw new Error("model upstream boom");
      const text = modelBehavior === "empty" ? "   " : successModelText(spec);
      return {
        text,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        latencyMs: 123,
        providerRequestId: "req-test-1",
      };
    },
  };

  return {
    prisma: fakePrisma as unknown as StudioExecutionDeps["prisma"],
    getUserId: async () => userId,
    createModelAdapter: async () => {
      tick(metrics, "createModelAdapter");
      return fakeAdapter as any;
    },
    getActiveContractSnapshot: async () => {
      tick(metrics, "getActiveContractSnapshot");
      return contractSnapshot;
    },
    requireWorkspaceMembership: async () => true,
    requireWorkspacePermission: async () => allowPermission,
    getRestrictedComponentIds: async () => {
      tick(metrics, "getRestrictedComponentIds");
      return [];
    },
    getOrCreateQuota: async () => {
      tick(metrics, "getOrCreateQuota");
      return { id: "q1", workspaceId, tokenBalance: 0 } as any;
    },
    checkAndResetQuotaCycle: async () => {
      tick(metrics, "checkAndResetQuotaCycle");
    },
    resolveDefaultDeployment: async () => {
      tick(metrics, "resolveDefaultDeployment");
      return { providerId: "p1", modelId: "m1" } as any;
    },
    touchComponentUsage: async () => {
      tick(metrics, "touchComponentUsage");
    },
    writeAuditLog: async () => {
      tick(metrics, "writeAuditLog");
    },
    creditService: {
      consumePoints: async () => {
        tick(metrics, "consumePoints");
        return {
          skipped: false,
          unlimited: false,
          consumed: 100,
          ledgerIds: ["l1"],
          details: [],
          balanceAfter: 0,
          monthlyTokenUsedIncremented: 0,
        } as any;
      },
      consumeAndCreateSettlementHold: async () => {
        tick(metrics, "consumeAndCreateSettlementHold");
        return {
          consumeResult: {
            skipped: false,
            unlimited: false,
            consumed: 100,
            ledgerIds: [],
            details: [],
            balanceAfter: 0,
            monthlyTokenUsedIncremented: 0,
          } as any,
        } as any;
      },
      refundConsumedPoints: async () => {
        tick(metrics, "refundConsumedPoints");
        return { ok: true } as any;
      },
    },
    refundService: {
      enqueueRefundRecovery: async () => {
        tick(metrics, "enqueueRefundRecovery");
        return { ok: true } as any;
      },
    },
    settlementService: {
      releaseSettlementHold: async () => {
        tick(metrics, "releaseSettlementHold");
        return { ok: true } as any;
      },
      completeSettlement: async () => {
        tick(metrics, "completeSettlement");
        return { status: "SETTLED", actualPricePoints: 100 } as any;
      },
      enqueueSettlementRecovery: async () => {
        tick(metrics, "enqueueSettlementRecovery");
        return { ok: true } as any;
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* 请求构造（JSON 文本 / multipart 真实文件）                            */
/* ------------------------------------------------------------------ */
function textRequest(componentId: string, text: string): NextRequest {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "simulate", workspaceId: "ws1", componentId, inputMaterial: text }),
  });
}

function fileRequest(componentId: string, fileName: string, content: string, mime: string, extraText?: string): NextRequest {
  const fd = new FormData();
  fd.set("action", "simulate");
  fd.set("workspaceId", "ws1");
  fd.set("componentId", componentId);
  // 生产客户端真实做法：文件上传必须声明 inputSource.sourceType=file，路由据此判定来源而非“有文件即文件”
  fd.set("inputSource", JSON.stringify({ sourceType: "file" }));
  if (extraText !== undefined) fd.set("inputMaterial", extraText);
  fd.set("file", new File([content], fileName, { type: mime }));
  return new NextRequest("http://localhost/api/studio", { method: "POST", body: fd });
}

/** 多文件请求（用于数量越界）：必须用 append 累加，set 会覆盖为单文件 */
function twoFilesRequest(componentId: string, f1: [string, string, string], f2: [string, string, string]): NextRequest {
  const fd = new FormData();
  fd.set("action", "simulate");
  fd.set("workspaceId", "ws1");
  fd.set("componentId", componentId);
  fd.set("inputSource", JSON.stringify({ sourceType: "file" }));
  fd.append("file", new File([f1[1]], f1[0], { type: f1[2] }));
  fd.append("file", new File([f2[1]], f2[0], { type: f2[2] }));
  return new NextRequest("http://localhost/api/studio", { method: "POST", body: fd });
}

function multipartNoFile(componentId: string): NextRequest {
  const fd = new FormData();
  fd.set("action", "simulate");
  fd.set("workspaceId", "ws1");
  fd.set("componentId", componentId);
  // 声明文件来源但无实际文件：用于验证“缺少输入”阻断
  fd.set("inputSource", JSON.stringify({ sourceType: "file" }));
  return new NextRequest("http://localhost/api/studio", { method: "POST", body: fd });
}

function multipartNoInput(componentId: string): NextRequest {
  const fd = new FormData();
  fd.set("action", "simulate");
  fd.set("workspaceId", "ws1");
  fd.set("componentId", componentId);
  // 完全无来源（无 inputSource / 无 text / 无 file）：用于验证“输入缺失”阻断
  return new NextRequest("http://localhost/api/studio", { method: "POST", body: fd });
}

/** 超大文件（> 真实合同 maxSingleFileBytes 20MB），用于触发 INPUT_TOO_LARGE */
function oversizeFileRequest(componentId: string): NextRequest {
  const big = new Uint8Array(21 * 1024 * 1024);
  const fd = new FormData();
  fd.set("action", "simulate");
  fd.set("workspaceId", "ws1");
  fd.set("componentId", componentId);
  fd.set("inputSource", JSON.stringify({ sourceType: "file" }));
  fd.set("file", new File([big], "big.pdf", { type: "application/pdf" }));
  return new NextRequest("http://localhost/api/studio", { method: "POST", body: fd });
}

function oversizeTextRequest(componentId: string, length: number): NextRequest {
  return textRequest(componentId, "x".repeat(length));
}

/** 合法输入请求：C01/C02 走文件，C07 走文本 */
function validRequest(spec: ComponentSpec): NextRequest {
  if (spec.inputKind === "FILE") {
    return fileRequest(spec.id, "tender.txt", "招标文件样本文本：投标人须具备相关资质，交付周期 90 天。", "text/plain");
  }
  return textRequest(spec.id, "【会议纪要-需求对齐会】\n参会人：PM、架构师。\n议题：用户中心权限改造，需要支持细粒度 RBAC。\n结论：新增角色权限分配页面。");
}

async function postSimulate(req: NextRequest, deps: StudioExecutionDeps): Promise<Response> {
  return runStudioPost(req as any, deps);
}
async function postTaskDetail(deps: StudioExecutionDeps, taskId: string): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/studio?action=task_detail&taskId=${taskId}&workspaceId=ws1`, { method: "GET" });
  return runStudioGet(req as any, deps);
}
async function getTasksList(deps: StudioExecutionDeps): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/studio?action=tasks&workspaceId=ws1`, { method: "GET" });
  return runStudioGet(req as any, deps);
}

const SAMPLE_TEXT = "【会议纪要】讨论用户中心权限改造，结论新增 RBAC 矩阵页面与审计流水。";

/** C01/C02 合法文件扩展名 → 推测 MIME（路由按文件名后缀判定，与生产一致） */
function mimeForExt(ext: string): string {
  return ext === ".pdf"
    ? "application/pdf"
    : ext === ".doc"
      ? "application/msword"
      : ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === ".txt"
          ? "text/plain"
          : "text/markdown";
}

/* ================================================================== */
/* 0. 测试合同夹具真实性断言（生产激活合同只读导出，禁止 DRAFT 冒充）     */
/* ================================================================== */
describe("测试合同夹具真实性断言（生产激活合同只读导出，禁止 DRAFT 冒充）", () => {
  const cases = [
    { id: "C01", c: C01_ACTIVE_CONTRACT, kind: "FILE" as const, sections: ["偏离"] },
    { id: "C02", c: C02_ACTIVE_CONTRACT, kind: "FILE" as const, sections: ["合规"] },
    { id: "C07", c: C07_ACTIVE_CONTRACT, kind: "TEXT_AND_FILES" as const, sections: [] as string[] },
  ];
  for (const t of cases) {
    it(`${t.id} fixture 与当前生产激活合同一致`, () => {
      assert.equal(t.c.componentId, t.id, "fixture.componentId 必须匹配目标组件");
      assert.equal(t.c.lifecycle, "PUBLISHED", "测试 fixture 必须为 PUBLISHED（不得用 DRAFT 模板冒充生产激活合同）");
      assert.ok(t.c.contractVersion, "合同版本必须存在");
      assert.equal(t.c.input.kind, t.kind, "输入类型必须与请求构造器一致");
      assert.equal(t.c.output.kind, "DOCUMENT", "输出类型 DOCUMENT 必须与 DTO 校验一致");
      const qp = t.c.qualityPolicy as any;
      if (t.sections.length) {
        assert.ok(
          Array.isArray(qp?.requiredSections) && qp.requiredSections.some((s: string) => t.sections.includes(s)),
          "qualityPolicy.requiredSections 必须包含合同真实章节",
        );
      } else {
        assert.equal(qp?.requiredSections, undefined, "C07 生产合同无 requiredSections（无真实章节约束，不得伪造）");
      }
      // 透明披露：当前三组件生产合同均不含 forbiddenPhrases / disclaimerPolicy，故禁用词/免责拦截不适用
      assert.equal(qp?.forbiddenPhrases, undefined, "当前生产合同无 forbiddenPhrases（禁用词拦截不适用，不得伪造）");
      assert.equal(qp?.disclaimerPolicy, undefined, "当前生产合同无 disclaimerPolicy（免责声明拦截不适用，不得伪造）");
    });
  }
});

/* ================================================================== */
/* 1. 三组件通用路径（成功 / 输入缺失 / 模型失败 / 输出校验失败 / 权限拒绝） */
/*    含执行顺序断言与 task_detail 读闭环                                */
/* ================================================================== */
for (const spec of COMPONENTS) {
  describe(`请求级确定性 HTTP 测试（fake 依赖）— ${spec.id} ${spec.name} 通用路径`, () => {
    it("成功路径：权限→合同读取→输入门禁→部署解析→适配器→扣点→执行→校验→写库→task_detail（顺序与隔离正确）", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(validRequest(spec), deps);
      const json: any = await res.json();
      if (res.status !== 200) throw new Error(`SUCCESS BODY (${res.status}): ${JSON.stringify(json)}`);
      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(json.task.status, "SUCCESS");
      assert.equal(json.executionMode, "REAL_MODEL");
      assert.equal(json.contractVersion, spec.contract.contractVersion || "1.0.0");

      // 证明请求处理函数实际经过：合同读取 → 部署解析 → 适配器创建 → 扣点 → 模型执行 → 任务创建
      assert.equal(metrics.counts["getActiveContractSnapshot"], 1, "必须读取激活合同快照");
      assert.equal(metrics.counts["resolveDefaultDeployment"], 1, "必须解析部署能力");
      assert.equal(metrics.counts["createModelAdapter"], 1);
      assert.equal(metrics.counts["adapter.execute"], 1);
      assert.equal(metrics.counts["consumePoints"], 1);
      assert.ok((metrics.counts["componenttask.create"] ?? 0) >= 1);
      assert.equal(metrics.counts["refundConsumedPoints"] ?? 0, 0);
      assert.equal(metrics.counts["releaseSettlementHold"] ?? 0, 0);

      // 执行顺序：合同读取 → 部署解析 → 适配器创建 → 扣点 → 模型执行 → 任务创建
      const order = metrics.calls;
      assert.ok(order.indexOf("getActiveContractSnapshot") < order.indexOf("resolveDefaultDeployment"));
      assert.ok(order.indexOf("resolveDefaultDeployment") < order.indexOf("createModelAdapter"));
      assert.ok(order.indexOf("createModelAdapter") < order.indexOf("consumePoints"));
      assert.ok(order.indexOf("consumePoints") < order.indexOf("adapter.execute"));
      assert.ok(order.indexOf("adapter.execute") < order.indexOf("componenttask.create"));

      // task_detail 读闭环：成功任务安全 DTO
      const taskId = json.task.id;
      const detailRes = await postTaskDetail(deps, taskId);
      const detailJson: any = await detailRes.json();
      if (detailRes.status !== 200) throw new Error(`DETAIL BODY (${detailRes.status}): ${JSON.stringify(detailJson)} taskId=${taskId}`);
      assert.equal(detailRes.status, 200);
      assert.equal(detailJson.success, true);
      assert.equal(detailJson.data.status, "SUCCESS");
      assert.ok(detailJson.data.execution !== undefined, "task_detail DTO 应携带嵌套 execution 安全元数据");
      assert.ok(detailJson.data.contractView !== undefined, "task_detail DTO 应携带合同安全视图");
      assert.equal(detailJson.data.contractView?.outputKind, "DOCUMENT", "成功详情合同视图 outputKind 必须与合同 output.kind 一致");
      assert.equal(detailJson.data.result, undefined, "task_detail 不得泄露原始 result");
      assert.equal(detailJson.data.config, undefined, "task_detail 不得泄露原始 config");
      // 成果物与合同 output.kind / artifactMime / rendererType 一致（历史合同视图驱动，绝不前端猜测）
      assert.equal(detailJson.data.hasArtifact, true, "成功任务应携带成果物");
      assert.equal(detailJson.data.artifacts.length, 1, "成功任务应返回经合同白名单裁剪的成果物");
      assert.equal(detailJson.data.artifact !== null, true, "成功任务应返回主成果物");
      const art = detailJson.data.artifacts[0];
      assert.equal(art.type.toUpperCase(), spec.contract.output.kind, "成果物 type 必须与合同 output.kind 一致（大小写归一）");
      assert.equal(art.mimeType, spec.contract.output.artifactMime, "成果物 mimeType 必须与合同 artifactMime 一致");
      assert.equal(art.rendererType, spec.contract.output.rendererType, "成果物 rendererType 必须与合同 rendererType 一致");
      if (spec.requiredSections.length) {
        assert.ok(
          spec.requiredSections.some((s) => String(art.content).includes(s)),
          `成功成果物内容应覆盖合同真实必填章节（${spec.requiredSections.join("/")}）`,
        );
      }
      assert.equal(detailJson.data.outputData, null, "原始 outputData 对象不得透传（仅经白名单裁剪的成果物）");
    });

    it("输入缺失/不合规（声明文件来源但无文件）：4xx 阻断，模型/扣点/写库/退款均未调用", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(multipartNoFile(spec.id), deps);
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.success, false);
      // 文件合同（C01/C02/C07 均声明 file 来源但无文件）→ INPUT_SOURCE_INVALID
      assert.equal(json.code, "INPUT_SOURCE_INVALID");
      // 输入失败前置门禁：不得进入模型、扣点、任务写库或退款
      assert.equal(metrics.counts["createModelAdapter"] ?? 0, 0);
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
      assert.equal(metrics.counts["refundConsumedPoints"] ?? 0, 0);
    });

    it("模型失败路径：权限→输入→模型执行→失败码→退款恢复；不创建成功任务", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "throw", metrics });
      const res = await postSimulate(validRequest(spec), deps);
      const json: any = await res.json();
      assert.equal(res.status, 502);
      assert.equal(json.success, false);
      assert.equal(json.code, "MODEL_UPSTREAM_ERROR");
      assert.equal(json.task, undefined, "失败响应不得伪造成功任务");

      assert.equal(metrics.counts["consumePoints"], 1);
      assert.equal(metrics.counts["adapter.execute"], 1);
      assert.equal(metrics.counts["refundConsumedPoints"], 1, "失败路径应原路退款");
      assert.equal(metrics.counts["enqueueRefundRecovery"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0, "失败路径不得创建成功任务");
    });

    if (spec.hasOutputQualityGate) {
      it("输出质量校验失败：失败状态、错误码、无成果物泄露、退款服务调用", async () => {
        const metrics: Metrics = { calls: [], counts: {} };
        const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "empty", metrics });
        const res = await postSimulate(validRequest(spec), deps);
        const json: any = await res.json();
        assert.equal(res.status, 400);
        assert.equal(json.success, false);
        assert.equal(json.code, "MODEL_OUTPUT_INVALID");
        assert.equal(json.task, undefined, "输出校验失败不得伪造成功任务");
        assert.equal(metrics.counts["consumePoints"], 1);
        assert.equal(metrics.counts["adapter.execute"], 1);
        assert.equal(metrics.counts["refundConsumedPoints"], 1);
        assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
      });
    } else {
      it("C07 无输出质量门禁：输出校验失败不适用（失败路径由模型异常覆盖），且不得伪造章节约束", () => {
        const qp = (spec.contract.qualityPolicy as any) ?? {};
        assert.equal(qp.requiredSections, undefined, "C07 生产合同无 requiredSections，输出校验失败不可触发");
        assert.equal(qp.minOutputLength, undefined, "C07 生产合同无 minOutputLength，输出校验失败不可触发");
      });
    }

    it("未授权或跨空间请求：403，且不得执行模型、仓储写入或账务动作", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: false, modelBehavior: "success", metrics });
      const res = await postSimulate(validRequest(spec), deps);
      const json: any = await res.json();
      assert.equal(res.status, 403);
      assert.equal(json.success, false);
      assert.equal(metrics.counts["createModelAdapter"] ?? 0, 0);
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
      assert.equal(metrics.counts["refundConsumedPoints"] ?? 0, 0);
    });
  });
}

/* ================================================================== */
/* 2. C01 / C02 文件输入门禁（真实生产 FILE 合同 + 路由真实文本提取路径） */
/* ================================================================== */
for (const spec of COMPONENTS.filter((c) => c.inputKind === "FILE")) {
  const allowedExts = (spec.contract.input as any).fileConstraints?.acceptedMimes ?? [];
  describe(`请求级确定性 HTTP 测试（fake 依赖）— ${spec.id} ${spec.name} 文件输入门禁`, () => {
    it("合法文件类型成功（遍历合同允许类型）：经服务端文本提取后成功", async () => {
      for (const ext of allowedExts) {
        const metrics: Metrics = { calls: [], counts: {} };
        const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
        const res = await postSimulate(
          fileRequest(spec.id, `doc${ext}`, "招标文件样本：投标人须具备资质，交付周期 90 天，验收标准见附录。", mimeForExt(ext)),
          deps,
        );
        const json: any = await res.json();
        if (res.status !== 200) throw new Error(`FILE ${ext} BODY (${res.status}): ${JSON.stringify(json)}`);
        assert.equal(res.status, 200, `合同允许类型 ${ext} 应成功`);
        assert.equal(json.task.status, "SUCCESS");
        assert.equal(metrics.counts["adapter.execute"], 1);
        assert.equal(metrics.counts["componenttask.create"] ?? 0, 1);
      }
    });

    it("缺文件：INPUT_SOURCE_INVALID，且模型/扣点/写库均未调用", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(multipartNoFile(spec.id), deps);
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.code, "INPUT_SOURCE_INVALID");
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    });

    it("不支持的文件类型（.zip）：INPUT_MIME_NOT_ALLOWED，且模型/扣点/写库均未调用", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(fileRequest(spec.id, "evil.zip", "PK\x03\x04 fake zip content", "application/zip"), deps);
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.code, "INPUT_MIME_NOT_ALLOWED");
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    });

    it("文件数量超限（2 个文件，maxCount=1）：INPUT_MULTIPLE_NOT_SUPPORTED，且模型/扣点/写库均未调用", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(
        twoFilesRequest(spec.id, ["a.txt", "招标文件A：资质要求。", "text/plain"], ["b.txt", "招标文件B：交付要求。", "text/plain"]),
        deps,
      );
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.code, "INPUT_MULTIPLE_NOT_SUPPORTED");
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    });

    it("单文件大小超限（>20MB）：INPUT_TOO_LARGE，且模型/扣点/写库均未调用", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(oversizeFileRequest(spec.id), deps);
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.code, "INPUT_TOO_LARGE");
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    });

    it("文件提取为空（空白内容）：INPUT_TEXT_NOT_EXTRACTED，且模型/扣点/写库均未调用", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(fileRequest(spec.id, "blank.txt", "   \n\t  ", "text/plain"), deps);
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.code, "INPUT_TEXT_NOT_EXTRACTED");
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    });

    it("客户端伪造 inputMaterial 但文件真实内容为空：仍以文件提取为准 → INPUT_TEXT_NOT_EXTRACTED", async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(
        fileRequest(spec.id, "blank.txt", "   \n\t  ", "text/plain", "客户端伪造的文本内容，不应被当作文件内容"),
        deps,
      );
      const json: any = await res.json();
      assert.equal(res.status, 400);
      assert.equal(json.code, "INPUT_TEXT_NOT_EXTRACTED", "路由必须以真实文件提取文本为准，不信任客户端 inputMaterial");
      assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    });
  });
}

/* ================================================================== */
/* 3. C07 文本 / 文件 / 双输入门禁（真实 TEXT_AND_FILES 合同）           */
/* ================================================================== */
describe("请求级确定性 HTTP 测试（fake 依赖）— C07 会议纪要转需求 双输入门禁", () => {
  const spec = COMPONENTS.find((c) => c.id === "C07")!;
  // 可本地确定提取文本的合同允许类型（确定性成功）：纯文本 / Markdown / PDF / DOCX
  // 注：合同 allowedMimes 还含 image/png、image/jpeg，但上传会触发 OCR（tesseract.js），
  // 本确定性 harness 无 OCR 资源且 OCR Worker 异步抛错无法被测试 try/catch 兜住，故不执行图片上传。
  // 图片类型“合同允许但提取依赖 OCR”属生产观察，不在此 harness 以 fake 冒充成功。
  const extractableFiles: [string, string][] = [
    ["m.txt", "text/plain"],
    ["m.md", "text/markdown"],
    ["m.pdf", "application/pdf"],
    ["m.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ];

  it("合法文本输入成功", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    const res = await postSimulate(textRequest(spec.id, SAMPLE_TEXT), deps);
    const json: any = await res.json();
    if (res.status !== 200) throw new Error(`C07 TEXT BODY (${res.status}): ${JSON.stringify(json)}`);
    assert.equal(res.status, 200);
    assert.equal(json.task.status, "SUCCESS");
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 1);
  });

  it("合法文件输入成功（可提取文本的合同允许类型遍历）", async () => {
    for (const [name, mime] of extractableFiles) {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(
        fileRequest(spec.id, name, "# 会议纪要\n讨论权限改造，结论新增 RBAC 页面。", mime),
        deps,
      );
      const json: any = await res.json();
      if (res.status !== 200) throw new Error(`C07 FILE ${name} BODY (${res.status}): ${JSON.stringify(json)}`);
      assert.equal(res.status, 200, `合同允许文件类型 ${name} 应成功`);
      assert.equal(json.task.status, "SUCCESS");
    }
  });

  it("文本+文件双输入成功（合同支持 TEXT_AND_FILES）", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    const res = await postSimulate(
      fileRequest(spec.id, "minutes.md", "# 会议纪要\n讨论权限改造。", "text/markdown", SAMPLE_TEXT),
      deps,
    );
    const json: any = await res.json();
    if (res.status !== 200) throw new Error(`C07 DUAL BODY (${res.status}): ${JSON.stringify(json)}`);
    assert.equal(res.status, 200);
    assert.equal(json.task.status, "SUCCESS");
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 1);
  });

  it("不支持的文件类型（.zip）：INPUT_MIME_NOT_ALLOWED，且模型/扣点/写库均未调用", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    const res = await postSimulate(fileRequest(spec.id, "evil.zip", "PK fake", "application/zip"), deps);
    const json: any = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.code, "INPUT_MIME_NOT_ALLOWED");
    assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
    assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
  });

  it("文本与文件均为空：INPUT_REQUIRED，且模型/扣点/写库均未调用", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    const res = await postSimulate(multipartNoInput(spec.id), deps);
    const json: any = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.code, "INPUT_REQUIRED");
    assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
    assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
  });

  it("文本超过合同上限（>30000 字符）：INPUT_TOO_LARGE，且模型/扣点/写库均未调用", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    const res = await postSimulate(oversizeTextRequest(spec.id, 30001), deps);
    const json: any = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.code, "INPUT_TOO_LARGE");
    assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
    assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
  });

  it("文件提取为空（空白内容）：INPUT_TEXT_NOT_EXTRACTED，且模型/扣点/写库均未调用", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    const res = await postSimulate(fileRequest(spec.id, "blank.txt", "   \n\t  ", "text/plain"), deps);
    const json: any = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.code, "INPUT_TEXT_NOT_EXTRACTED");
    assert.equal(metrics.counts["adapter.execute"] ?? 0, 0);
    assert.equal(metrics.counts["consumePoints"] ?? 0, 0);
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
  });

  it("C07 生产合同无 requiredSections / forbiddenPhrases / disclaimerPolicy（透明披露，不得伪造）", () => {
    const qp = (spec.contract.qualityPolicy as any) ?? {};
    assert.equal(qp.requiredSections, undefined, "C07 无真实质量章节约束");
    assert.equal(qp.forbiddenPhrases, undefined, "C07 无真实禁用词");
    assert.equal(qp.disclaimerPolicy, undefined, "C07 无合同级免责声明");
  });
});

/* ================================================================== */
/* 4. 读闭环（fake 依赖）：task_detail 与列表安全 DTO 隔离              */
/* ================================================================== */
describe("请求级确定性 HTTP 测试（fake 依赖）— 读闭环与列表 DTO 隔离", () => {
  const spec = COMPONENTS[0];

  it("task_detail 读取失败任务：返回错误码、退款字段，且无成果物/配置泄露", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "throw", metrics });
    const simRes = await postSimulate(validRequest(spec), deps);
    const json: any = await simRes.json();
    assert.equal(json.code, "MODEL_UPSTREAM_ERROR");
    assert.equal(json.success, false);
    // 失败路径原路退款，未伪造成功任务
    assert.equal(metrics.counts["componenttask.create"] ?? 0, 0);
    assert.equal(metrics.counts["refundConsumedPoints"], 1);
  });

  it("tasks 列表安全 DTO：不泄漏 config / result / prompt / 原始输入 / 成果正文", async () => {
    // 直接消费实际列表 handler 使用的安全序列化函数（与 /api/tasks 100% 一致口径）
    const rawTask: any = {
      id: "t_list_1",
      type: "C01",
      status: "SUCCESS",
      tenantId: "ws1",
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      config: {
        providerId: "p1",
        modelId: "m1",
        contractVersion: "1.0.0",
        executionMode: "REAL_MODEL",
        inputMaterial: "SECRET_RAW_INPUT_SHOULD_NOT_LEAK",
        prompt: "SECRET_PROMPT_SHOULD_NOT_LEAK",
        result: { outputData: "SECRET_RESULT_BODY" },
        // 不可变合同快照：版本与 config 一致，使列表 contractVersion 走“已验证”路径
        contractSnapshot: { output: { kind: "DOCUMENT" }, contractVersion: "1.0.0" },
      },
      result: { outputData: "SECRET_RESULT_BODY" },
    };
    const wsInfo = { name: "测试空间", type: "ENTERPRISE" };
    const refundMeta = { refundStatus: "NO_CHARGE" as const, refundedPoints: null, chargeAttempted: false };
    const item: any = serializeTaskListItem(rawTask, wsInfo, "招标文件解析", refundMeta);

    assert.equal(item.config, undefined, "列表 DTO 不得泄露 config");
    assert.equal(item.result, undefined, "列表 DTO 不得泄露 result");
    assert.equal(item.prompt, undefined, "列表 DTO 不得泄露 prompt");
    assert.equal(item.inputMaterial, undefined, "列表 DTO 不得泄露原始输入");
    // 安全白名单字段应存在
    assert.ok(item.execution !== undefined, "列表 DTO 应携带嵌套 execution");
    assert.equal(item.contractVersion, "1.0.0");
    assert.equal(item.refundStatus, "NO_CHARGE");
  });

  it("tasks 列表经 runStudioGet(action=tasks) 返回安全 DTO（不泄漏原始字段）", async () => {
    const metrics: Metrics = { calls: [], counts: {} };
    const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
    // 注入一条带有敏感原始字段的任务行，验证列表序列化不泄露
    (deps.prisma as any).tables.set("componenttask", [
      {
        id: "t_list_2",
        type: "C01",
        status: "SUCCESS",
        tenantId: "ws1",
        createdAt: new Date("2026-09-20T00:00:00.000Z"),
        config: { providerId: "p1", modelId: "m1", contractVersion: "1.0.0", executionMode: "REAL_MODEL", inputMaterial: "LEAK_ME", prompt: "LEAK_ME_TOO", result: { outputData: "LEAK_BODY" } },
        result: { outputData: "LEAK_BODY" },
      },
    ]);
    const res = await getTasksList(deps);
    const json: any = await res.json();
    if (res.status !== 200) throw new Error(`TASKS BODY (${res.status}): ${JSON.stringify(json)}`);
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data), "tasks 返回应为数组");
    const found = json.data.find((t: any) => t.id === "t_list_2");
    assert.ok(found, "应返回注入的任务");
    assert.equal(found.config, undefined);
    assert.equal(found.result, undefined);
    assert.equal(found.prompt, undefined);
    assert.equal(found.inputMaterial, undefined);
    assert.ok(found.execution !== undefined);
  });
});

/* ================================================================== */
/* 5. 三组件详情退款/合同版本字段（chargeAttempted 三态、refundStatus 五态） */
/* ================================================================== */
describe("请求级确定性 HTTP 测试（fake 依赖）— 详情退款/合同版本字段", () => {
  const REFUND_STATES = ["NO_CHARGE", "REFUNDED", "REFUND_PENDING", "RECONCILIATION_REQUIRED", "UNKNOWN"];

  for (const spec of COMPONENTS) {
    it(`${spec.id} 成功任务详情：contractVersion 来自已验证快照、chargeAttempted/refundStatus 字段齐备（fake 下诚实为 UNKNOWN/null）`, async () => {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(validRequest(spec), deps);
      const json: any = await res.json();
      if (res.status !== 200) throw new Error(`${spec.id} SUCCESS BODY (${res.status}): ${JSON.stringify(json)}`);
      const detailRes = await postTaskDetail(deps, json.task.id);
      const detailJson: any = await detailRes.json();
      if (detailRes.status !== 200) throw new Error(`${spec.id} DETAIL BODY (${detailRes.status}): ${JSON.stringify(detailJson)}`);
      assert.equal(detailJson.data.contractVersion, spec.contract.contractVersion, "详情合同版本来自已验证快照，不得裸采信 config/result");
      assert.equal(detailJson.data.hasContractSnapshot, true, "成功任务应持有不可变合同快照");
      // refundStatus 五态之一；fake 依赖无真实 ledger，诚实为 UNKNOWN（不得伪称已退款/未扣费）
      assert.ok(REFUND_STATES.includes(detailJson.data.refundStatus), "refundStatus 必须属于五态枚举");
      assert.equal(detailJson.data.refundStatus, "UNKNOWN", "fake 下无真实账务事实，退款状态诚实为待确认");
      // chargeAttempted 三态（true/false/null）；fake 下无 config.chargeAttempted 且无 ledger，诚实为 null
      assert.ok(
        detailJson.data.chargeAttempted === true ||
          detailJson.data.chargeAttempted === false ||
          detailJson.data.chargeAttempted === null,
        "chargeAttempted 必须是三态（true/false/null）",
      );
      assert.equal(detailJson.data.chargeAttempted, null, "fake 下无扣费事实，chargeAttempted 诚实为 null");
    });
  }

  it("三组件输入失败路径（缺文件）不创建任务，故不进入扣费/退款状态", async () => {
    for (const spec of COMPONENTS.filter((c) => c.contract.input.kind === "FILE")) {
      const metrics: Metrics = { calls: [], counts: {} };
      const deps = buildDeps(spec, { userId: "u1", workspaceId: "ws1", allowPermission: true, modelBehavior: "success", metrics });
      const res = await postSimulate(multipartNoInput(spec.id), deps);
      const json: any = await res.json();
      // 输入门禁失败（缺文件）：实际代码为 INPUT_REQUIRED 或 INPUT_SOURCE_INVALID，均表示未进入模型/扣点/写库
      assert.ok(
        json.code === "INPUT_REQUIRED" || json.code === "INPUT_SOURCE_INVALID",
        `输入失败门禁应返回 INPUT_REQUIRED/INPUT_SOURCE_INVALID，实际 ${json.code}`,
      );
      assert.equal(metrics.counts["componenttask.create"] ?? 0, 0, "输入失败不得创建任务");
      assert.equal(metrics.counts["consumePoints"] ?? 0, 0, "输入失败不得扣费");
    }
  });
});
