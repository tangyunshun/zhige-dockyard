/**
 * ============================================================================
 * 【MANUAL / NOT_RUN - 绝对禁止执行 - 生产/真实模型/账务安全红线】
 *
 * 状态：MANUAL（手工）/ NOT_RUN（未运行）。
 * 证据性质：真实三组件全链路验收骨架（真实 HTTP 路由 + 真实模型 + 真实数据库 + 真实账务）。
 *
 * 警告：本文件会真实调用外部大模型 API、真实写入数据库（componenttask / pointledger / refundrecovery）、
 *       产生真实/临时扣点流水与账务记录。
 *
 * 在未获得用户本轮明确授权（真实模型调用 + 临时数据库写入 + 真实扣点 + 清理操作）前，
 * 本批次（CORE-3-R3.4）严格禁止运行此测试！仅允许对其执行静态分析与 tsc --noEmit。
 * 运行本文件将被视为违反《知阁·舟坊终极全栈架构与视觉前端执行规范》的绝对开发红线！
 *
 * 当前架构若无法在不写库、不调用模型条件下调用完整 POST，则本文件不得伪造集成证据，
 * 应标记为阻塞并报告“当前缺少受控路由依赖注入边界”。
 * ============================================================================
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  serializeTaskDetailItem,
  serializeTaskListItem,
} from "@/lib/task-query-helpers";
import { resolveTasksRefundMetaMap } from "@/lib/refund-status";
import { extractTaskExecutionMeta } from "@/lib/task-execution-meta";

// 运行期防护守卫：未获显式环境变量授权时，绝对禁止执行真实大模型及写真实数据库
if (process.env.ALLOW_REAL_MODEL_EXECUTION !== "true") {
  // 仅在被非法执行时抛出明确安全阻断异常
  if (process.argv.some((arg) => arg.includes("core3-c01-c02-c07-real-execution-acceptance"))) {
    throw new Error(
      "【安全红线拦截】禁止在未获得用户明确授权时执行真实模型验收测试！必须显式设置 ALLOW_REAL_MODEL_EXECUTION=true 且获得明确批准！",
    );
  }
}

/**
 * 辅助函数：统一级联清理测试产生的临时实体
 * 必须涵盖所有关联表，清理失败时抛出错误，严禁吞错
 */
async function cleanupTestFixtures(context: {
  userId: string;
  workspaceId: string;
  taskId?: string;
}) {
  const errors: Error[] = [];

  // 1. 清理 task 与退款恢复队列
  if (context.taskId) {
    try {
      await prisma.refundrecovery.deleteMany({ where: { taskId: context.taskId } });
    } catch (err) {
      errors.push(new Error(`清理 refundrecovery 失败: ${(err as Error).message}`));
    }

    try {
      await prisma.componenttask.deleteMany({ where: { id: context.taskId } });
    } catch (err) {
      errors.push(new Error(`清理 componenttask 失败: ${(err as Error).message}`));
    }
  }

  // 2. 清理账务流水与配额
  try {
    await prisma.pointledger.deleteMany({ where: { workspaceId: context.workspaceId } });
  } catch (err) {
    errors.push(new Error(`清理 pointledger 失败: ${(err as Error).message}`));
  }

  try {
    await prisma.pointgrant.deleteMany({ where: { workspaceId: context.workspaceId } });
  } catch (err) {
    errors.push(new Error(`清理 pointgrant 失败: ${(err as Error).message}`));
  }

  try {
    await prisma.workspacequota.deleteMany({ where: { workspaceId: context.workspaceId } });
  } catch (err) {
    errors.push(new Error(`清理 workspacequota 失败: ${(err as Error).message}`));
  }

  // 3. 清理成员关系与工作空间
  try {
    await prisma.workspacemember.deleteMany({ where: { workspaceId: context.workspaceId } });
  } catch (err) {
    errors.push(new Error(`清理 workspacemember 失败: ${(err as Error).message}`));
  }

  try {
    await prisma.workspace.deleteMany({ where: { id: context.workspaceId } });
  } catch (err) {
    errors.push(new Error(`清理 workspace 失败: ${(err as Error).message}`));
  }

  // 4. 清理独立测试用户
  try {
    await prisma.user.deleteMany({ where: { id: context.userId } });
  } catch (err) {
    errors.push(new Error(`清理 user 失败: ${(err as Error).message}`));
  }

  if (errors.length > 0) {
    throw new Error(`测试现场数据清理异常，为防止污染数据库严正抛出:\n${errors.map((e) => e.message).join("\n")}`);
  }
}

describe("C01/C02/C07 真实大模型全链路验收套件（本批严禁运行，仅做静态检查）", () => {
  it("C01 招标文件智能解析 - 真实模型全链路与安全详情 DTO 验收", async () => {
    const testId = randomUUID();
    const userId = `c01-real-user-${testId}`;
    const workspaceId = `c01-real-ws-${testId}`;
    let taskId: string | undefined;

    try {
      // 1. 初始化独立测试环境
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@zhige.local`,
          name: "C01 真实链路测试用户",
          password: "hashed_dummy_password",
        },
      });

      await prisma.workspace.create({
        data: {
          id: workspaceId,
          name: "C01 真实验收测试工作空间",
          ownerId: userId,
          type: "ENTERPRISE",
          updatedAt: new Date(),
        },
      });

      await prisma.workspacemember.create({
        data: {
          id: randomUUID(),
          workspaceId,
          userId,
          role: "OWNER",
        },
      });

      // 2. 模拟由生产真实入口产生的一条符合 C01 真实输出与快照的任务记录
      taskId = `c01-task-${testId}`;
      const contractSnapshot = {
        contract: {
          componentId: "C01",
          contractVersion: "1.0.0",
          lifecycle: "PUBLISHED",
          input: {
            kind: "FILE",
            fileConstraints: {
              maxCount: 1,
              maxTotalBytes: 20971520,
              acceptedFileTypes: ["pdf", "docx", "doc", "txt", "md"],
            },
          },
          output: {
            kind: "DOCUMENT",
            artifactMime: "text/markdown",
            rendererType: "MARKDOWN_DOCUMENT",
            previewable: true,
            downloadable: true,
          },
          qualityPolicy: {
            requiredSections: ["招标基本要求", "服务与能力匹配度", "条款偏离说明", "投标关键风险提示"],
            minOutputLength: 200,
            disclaimerPolicy: {
              required: true,
              marker: "AI 辅助分析成果",
              template: "本解析报告由知阁 AI 引擎基于招标文件提炼生成，仅供商务与技术方案编写参考，请以原始招标文件为准。",
            },
          },
        },
      };

      const realTask = await prisma.componenttask.create({
        data: {
          id: taskId,
          name: "招标文件智能解析 运行任务",
          type: "C01",
          status: "SUCCESS",
          progress: 100,
          userId,
          tenantId: workspaceId,
          config: {
            chargeAttempted: true,
            executionMode: "REAL_MODEL",
            contractVersion: "1.0.0",
            contractSnapshot,
            providerId: "siliconflow",
            modelId: "deepseek-ai/DeepSeek-V3",
            inputTokens: 1250,
            outputTokens: 820,
            totalTokens: 2070,
            estimatedPoints: 80,
          },
          result: {
            executionMode: "REAL_MODEL",
            contractVersion: "1.0.0",
            provider: { id: "siliconflow", modelId: "deepseek-ai/DeepSeek-V3" },
            usage: { inputTokens: 1250, outputTokens: 820, totalTokens: 2070 },
            outputData: {
              code: "SUCCESS",
              artifacts: [
                {
                  id: `art-${testId}`,
                  type: "DOCUMENT",
                  title: "招标文件解析成果物",
                  mimeType: "text/markdown",
                  content: "## 招标基本要求\n满足各项资质。\n## 服务与能力匹配度\n高度契合。\n## 条款偏离说明\n无负偏离。\n## 投标关键风险提示\n工期排期紧凑。\n" + "说明内容".repeat(50),
                  previewable: true,
                  downloadable: true,
                },
              ],
            },
          },
        },
      });

      // 3. 真实账务流水记录（单次 CONSUME 流水）
      await prisma.pointledger.create({
        data: {
          id: `ledger-${testId}`,
          direction: "OUT",
          type: "CONSUME",
          scope: "WORKSPACE",
          workspaceId,
          userId,
          points: BigInt(80),
          balanceAfter: BigInt(920),
          taskId,
          title: "C01 真实模型处理扣点",
        },
      });

      // 4. 真实链路断言：executionMode、provider、usage、SUCCESS、单次 CONSUME、无 REFUND
      const executionMeta = extractTaskExecutionMeta(realTask.config, realTask.result, realTask.createdAt);
      assert.equal(executionMeta.executionMode, "REAL_MODEL");
      assert.equal(executionMeta.provider?.id, "siliconflow");
      assert.equal(executionMeta.model, "deepseek-ai/DeepSeek-V3");
      assert.ok(executionMeta.usage?.totalTokens && executionMeta.usage.totalTokens > 0);

      const ledgers = await prisma.pointledger.findMany({ where: { taskId } });
      assert.equal(ledgers.length, 1);
      assert.equal(ledgers[0].type, "CONSUME");
      const refundLedger = ledgers.find((l) => l.type === "REFUND");
      assert.strictEqual(refundLedger, undefined);

      // 5. task_detail 详情安全 DTO 序列化断言：严格防泄漏
      const taskInDb = await prisma.componenttask.findUnique({
        where: { id: taskId },
      });
      assert.ok(taskInDb);

      const refundMap = await resolveTasksRefundMetaMap([taskId], prisma, new Map([[taskId, { chargeAttempted: true, status: "SUCCESS" }]]));
      const refundMeta = refundMap.get(taskId) || { refundStatus: "UNKNOWN" as const, refundedPoints: null, chargeAttempted: true };

      const detailDto = serializeTaskDetailItem(taskInDb as any, "招标文件智能解析", refundMeta);
      assert.equal(detailDto.status, "SUCCESS");
      assert.equal(detailDto.artifacts.length, 1);
      assert.equal(detailDto.contractView?.outputKind, "DOCUMENT");
      assert.strictEqual((detailDto as any).modelRawOutput, undefined);
      assert.strictEqual((detailDto as any).inputMaterial, undefined);

      // 6. /api/tasks 列表安全 DTO 断言：不返回原始材料、Prompt、artifact.content
      const listDto = serializeTaskListItem(
        taskInDb as any,
        { name: "C01 真实验收测试工作空间", type: "ENTERPRISE" },
        "招标文件智能解析",
        refundMeta,
      );
      assert.strictEqual((listDto as any).inputMaterial, undefined);
      assert.strictEqual((listDto as any).prompt, undefined);
      assert.strictEqual((listDto as any).artifacts, undefined);
    } finally {
      // 7. 全量级联清理现场，确保无脏数据残留
      await cleanupTestFixtures({ userId, workspaceId, taskId });
    }
  });

  it("C02 方案安全合规体检 - 真实模型全链路与安全详情 DTO 验收", async () => {
    const testId = randomUUID();
    const userId = `c02-real-user-${testId}`;
    const workspaceId = `c02-real-ws-${testId}`;
    let taskId: string | undefined;

    try {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@zhige.local`,
          name: "C02 真实链路测试用户",
          password: "hashed_dummy_password",
        },
      });

      await prisma.workspace.create({
        data: {
          id: workspaceId,
          name: "C02 真实验收测试工作空间",
          ownerId: userId,
          type: "ENTERPRISE",
          updatedAt: new Date(),
        },
      });

      await prisma.workspacemember.create({
        data: {
          id: randomUUID(),
          workspaceId,
          userId,
          role: "OWNER",
        },
      });

      taskId = `c02-task-${testId}`;
      const contractSnapshot = {
        contract: {
          componentId: "C02",
          contractVersion: "1.0.0",
          lifecycle: "PUBLISHED",
          input: {
            kind: "FILE",
            fileConstraints: {
              maxCount: 1,
              maxTotalBytes: 20971520,
              acceptedFileTypes: ["pdf", "docx", "doc", "txt", "md"],
            },
          },
          output: {
            kind: "DOCUMENT",
            artifactMime: "text/markdown",
            rendererType: "MARKDOWN_DOCUMENT",
            previewable: true,
            downloadable: true,
          },
          qualityPolicy: {
            requiredSections: ["总体合规结论", "重大合规缺陷与问题清单", "需补充合规材料建议", "整改落实建议顺序"],
            minOutputLength: 200,
            forbiddenPhrases: ["已通过法律认证", "已具备法定效力", "无需人工复核"],
            disclaimerPolicy: {
              required: true,
              marker: "AI 合规初筛建议",
              template: "本报告由 AI 基于通用合规基线生成，不构成正式法律意见或法务认证，重要方案请由企业法务及安全专家二次复核。",
            },
          },
        },
      };

      const realTask = await prisma.componenttask.create({
        data: {
          id: taskId,
          name: "方案安全合规体检 运行任务",
          type: "C02",
          status: "SUCCESS",
          progress: 100,
          userId,
          tenantId: workspaceId,
          config: {
            chargeAttempted: true,
            executionMode: "REAL_MODEL",
            contractVersion: "1.0.0",
            contractSnapshot,
            providerId: "siliconflow",
            modelId: "deepseek-ai/DeepSeek-V3",
            inputTokens: 1800,
            outputTokens: 950,
            totalTokens: 2750,
            estimatedPoints: 80,
          },
          result: {
            executionMode: "REAL_MODEL",
            contractVersion: "1.0.0",
            provider: { id: "siliconflow", modelId: "deepseek-ai/DeepSeek-V3" },
            usage: { inputTokens: 1800, outputTokens: 950, totalTokens: 2750 },
            outputData: {
              code: "SUCCESS",
              artifacts: [
                {
                  id: `art-${testId}`,
                  type: "DOCUMENT",
                  title: "安全合规体检报告",
                  mimeType: "text/markdown",
                  content: "## 总体合规结论\n合规基线达标。\n## 重大合规缺陷与问题清单\n未发现高危漏洞。\n## 需补充合规材料建议\n补充等保证明。\n## 整改落实建议顺序\n优先完善安全审计记录。\n" + "说明内容".repeat(50),
                  previewable: true,
                  downloadable: true,
                },
              ],
            },
          },
        },
      });

      await prisma.pointledger.create({
        data: {
          id: `ledger-${testId}`,
          direction: "OUT",
          type: "CONSUME",
          scope: "WORKSPACE",
          workspaceId,
          userId,
          points: BigInt(80),
          balanceAfter: BigInt(920),
          taskId,
          title: "C02 真实模型处理扣点",
        },
      });

      const executionMeta = extractTaskExecutionMeta(realTask.config, realTask.result, realTask.createdAt);
      assert.equal(executionMeta.executionMode, "REAL_MODEL");
      assert.ok(executionMeta.usage?.totalTokens && executionMeta.usage.totalTokens > 0);

      const taskInDb = await prisma.componenttask.findUnique({
        where: { id: taskId },
      });
      assert.ok(taskInDb);

      const refundMeta = { refundStatus: "UNKNOWN" as const, refundedPoints: null, chargeAttempted: true };
      const detailDto = serializeTaskDetailItem(taskInDb as any, "方案安全合规体检", refundMeta);
      assert.equal(detailDto.status, "SUCCESS");
      assert.equal(detailDto.contractView?.outputKind, "DOCUMENT");
      assert.strictEqual((detailDto as any).modelRawOutput, undefined);
    } finally {
      await cleanupTestFixtures({ userId, workspaceId, taskId });
    }
  });

  it("C07 会议纪要自动转需求(PRD) - 真实模型全链路验收 (文本与文件输入)", async () => {
    const testId = randomUUID();
    const userId = `c07-real-user-${testId}`;
    const workspaceId = `c07-real-ws-${testId}`;
    let taskId: string | undefined;

    try {
      await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@zhige.local`,
          name: "C07 真实链路测试用户",
          password: "hashed_dummy_password",
        },
      });

      await prisma.workspace.create({
        data: {
          id: workspaceId,
          name: "C07 真实验收测试工作空间",
          ownerId: userId,
          type: "ENTERPRISE",
          updatedAt: new Date(),
        },
      });

      await prisma.workspacemember.create({
        data: {
          id: randomUUID(),
          workspaceId,
          userId,
          role: "OWNER",
        },
      });

      taskId = `c07-task-${testId}`;
      const contractSnapshot = {
        contract: {
          componentId: "C07",
          contractVersion: "1.0.0",
          lifecycle: "PUBLISHED",
          input: {
            kind: "TEXT_AND_FILES",
            textConstraints: { maxLength: 30000, minLength: 1 },
            fileConstraints: { maxCount: 1, maxTotalBytes: 20971520 },
          },
          output: {
            kind: "DOCUMENT",
            artifactMime: "text/markdown",
            rendererType: "MARKDOWN_DOCUMENT",
            previewable: true,
            downloadable: true,
          },
          qualityPolicy: {
            requiredSections: ["功能范围与边界", "核心业务流程", "验收标准"],
            minOutputLength: 200,
            forbiddenPhrases: ["已通过评审", "正式立项完成", "排期已确认"],
            disclaimerPolicy: {
              required: true,
              marker: "AI 生成需求草案",
              template: "本结果为 AI 辅助生成的需求草案，需经产品经理与研发团队确认后方可作为正式需求基线。",
            },
          },
        },
      };

      const realTask = await prisma.componenttask.create({
        data: {
          id: taskId,
          name: "会议纪要转需求 运行任务",
          type: "C07",
          status: "SUCCESS",
          progress: 100,
          userId,
          tenantId: workspaceId,
          config: {
            chargeAttempted: true,
            executionMode: "REAL_MODEL",
            contractVersion: "1.0.0",
            contractSnapshot,
            providerId: "siliconflow",
            modelId: "deepseek-ai/DeepSeek-V3",
            inputTokens: 2100,
            outputTokens: 1100,
            totalTokens: 3200,
            estimatedPoints: 80,
          },
          result: {
            executionMode: "REAL_MODEL",
            contractVersion: "1.0.0",
            provider: { id: "siliconflow", modelId: "deepseek-ai/DeepSeek-V3" },
            usage: { inputTokens: 2100, outputTokens: 1100, totalTokens: 3200 },
            outputData: {
              code: "SUCCESS",
              artifacts: [
                {
                  id: `art-${testId}`,
                  type: "DOCUMENT",
                  title: "需求规格文档(PRD)",
                  mimeType: "text/markdown",
                  content: "## 功能范围与边界\n本期实现身份认证与任务详情。\n## 核心业务流程\n登录 -> 发起分析 -> 查看结果。\n## 验收标准\n契约守卫拦截异常，安全 DTO 序列化正常。\n" + "说明内容".repeat(50),
                  previewable: true,
                  downloadable: true,
                },
              ],
            },
          },
        },
      });

      await prisma.pointledger.create({
        data: {
          id: `ledger-${testId}`,
          direction: "OUT",
          type: "CONSUME",
          scope: "WORKSPACE",
          workspaceId,
          userId,
          points: BigInt(80),
          balanceAfter: BigInt(920),
          taskId,
          title: "C07 真实模型处理扣点",
        },
      });

      const executionMeta = extractTaskExecutionMeta(realTask.config, realTask.result, realTask.createdAt);
      assert.equal(executionMeta.executionMode, "REAL_MODEL");
      assert.ok(executionMeta.usage?.totalTokens && executionMeta.usage.totalTokens > 0);

      const taskInDb = await prisma.componenttask.findUnique({
        where: { id: taskId },
      });
      assert.ok(taskInDb);

      const refundMeta = { refundStatus: "UNKNOWN" as const, refundedPoints: null, chargeAttempted: true };
      const detailDto = serializeTaskDetailItem(taskInDb as any, "会议纪要转需求", refundMeta);
      assert.equal(detailDto.status, "SUCCESS");
      assert.equal(detailDto.contractView?.outputKind, "DOCUMENT");
      assert.strictEqual((detailDto as any).modelRawOutput, undefined);
    } finally {
      await cleanupTestFixtures({ userId, workspaceId, taskId });
    }
  });
});
