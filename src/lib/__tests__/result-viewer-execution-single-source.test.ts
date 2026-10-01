/**
 * ResultViewer 执行元数据单轨行为测试（源码守卫/纯函数，非 HTTP 路由集成）
 *
 * 目标：证明 ResultViewer 渲染所消费的任务详情安全 DTO 的执行元数据（执行模式、provider/model、
 * usage、billingMode、点数、合同版本、qualityHints）只来自嵌套 config/result 执行字段，
 * 缺失时 executionMode 为 UNKNOWN（ResultViewer 据此显示「执行信息缺失」），绝不回退到顶层旧字段。
 * 与 production 详情接口（runStudioGet?action=task_detail）使用同一 serializeTaskDetailItem，
 * 不调用真实模型、真实数据库或真实账务。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { serializeTaskDetailItem } from "@/lib/task-query-helpers";

const REFUND_META = { refundStatus: "NO_CHARGE" as const, refundedPoints: null, chargeAttempted: false };

describe("ResultViewer 执行元数据单轨（来源：嵌套 task.execution，禁止顶层回退）", () => {
  it("有嵌套 config 执行字段时，详情安全 DTO 的 execution 逐字段正确（来自嵌套字段，非顶层）", () => {
    const raw: any = {
      id: "t1",
      name: "招标文件解析",
      type: "C01",
      status: "SUCCESS",
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      tenantId: "ws1",
      config: {
        providerId: "p1",
        modelId: "m1",
        contractVersion: "1.0.0",
        executionMode: "REAL_MODEL",
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
        billingMode: "ESTIMATED_COMPATIBILITY",
        estimatedPoints: 100,
        actualPoints: 100,
      },
    };
    const item: any = serializeTaskDetailItem(raw, "招标文件解析", REFUND_META);
    assert.ok(item.execution, "execution 应来自嵌套 config 执行字段");
    assert.equal(item.execution.provider?.id, "p1");
    assert.equal(item.execution.model, "m1");
    assert.equal(item.execution.contractVersion, "1.0.0");
    assert.equal(item.execution.executionMode, "REAL_MODEL");
    assert.equal(item.execution.usage?.totalTokens, 30);
    assert.equal(item.execution.billingMode, "ESTIMATED_COMPATIBILITY");
    assert.equal(item.execution.estimatedPoints, 100);
  });

  it("只有顶层旧字段（无嵌套 config/result 执行字段）时，execution 回退为 UNKNOWN/缺失，不得显示顶层旧字段", () => {
    const raw: any = {
      id: "t2",
      name: "招标文件解析",
      type: "C01",
      status: "SUCCESS",
      createdAt: new Date("2026-09-20T00:00:00.000Z"),
      tenantId: "ws1",
      // 仅顶层旧字段（旧客户端遗留），无 config.executionMode / providerId 等嵌套执行字段
      executionMode: "REAL_MODEL",
      provider: { id: "p1" },
      billingMode: "ESTIMATED",
      contractVersion: "1.0.0",
      config: {},
    };
    const item: any = serializeTaskDetailItem(raw, "招标文件解析", REFUND_META);
    assert.ok(item.execution, "execution 对象始终存在，但缺失时应标记为 UNKNOWN/缺失");
    // 严禁从顶层旧字段读取：以下必须不是顶层传入的值
    assert.equal(item.execution.executionMode, "UNKNOWN", "缺失执行模式不得回退为顶层 REAL_MODEL，应显示 UNKNOWN（执行信息缺失）");
    assert.equal(item.execution.provider, null, "缺失 provider 不得回退为顶层 provider");
    assert.equal(item.execution.contractVersion, null, "缺失合同版本不得回退为顶层 contractVersion");
  });
});
