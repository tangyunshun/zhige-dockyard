/**
 * CORE-3-R3.4 确定性验收红线（源码守卫 + 纯函数）：
 * 仅静态验证生产路由与前端消费边界，不调用真实模型、不写库、不产账务。
 * 真实 HTTP 路由全链路（含真实模型/数据库）见 core3-c01-c02-c07-real-execution-acceptance.test.ts（MANUAL / NOT_RUN）。
 */
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const helpersSrc = fs.readFileSync(path.join(process.cwd(), "src/lib/task-query-helpers.ts"), "utf-8");
const routeSrc = fs.readFileSync(path.join(process.cwd(), "src/app/api/studio/route.ts"), "utf-8");
const workspaceSrc = fs.readFileSync(path.join(process.cwd(), "src/components/WorkspaceInternalLayoutV3.tsx"), "utf-8");

describe("R3.4 确定性验收：/api/tasks 列表最小化", () => {
  it("IX-9. 列表序列化函数体不得读取/回传 config / result / inputMaterial / Prompt / artifact.content", () => {
    const start = helpersSrc.indexOf("export function serializeTaskListItem");
    const nextFn = helpersSrc.indexOf("\nexport function ", start + 20);
    const fnSrc = helpersSrc.slice(start, nextFn > 0 ? nextFn : start + 4000);
    // 仅检查列表 DTO 的白名单 return 对象字面量（避免误伤同文件其它函数）
    const retStart = fnSrc.indexOf("return {");
    const retEnd = fnSrc.indexOf("\n  };", retStart);
    const retSrc = fnSrc.slice(retStart, retEnd > 0 ? retEnd : retStart + 2000);
    // 校验返回 DTO 白名单字段本身不泄露敏感原始字段（task.config/task.result 仅为内部派生入参，不进入输出）
    assert.strictEqual(/\bconfig\s*:/.test(retSrc), false, "列表 DTO 严禁返回 config 字段");
    assert.strictEqual(/\bresult\s*:/.test(retSrc), false, "列表 DTO 严禁返回 result 字段（resultSummary 派生安全摘要除外）");
    assert.strictEqual(/inputMaterial/.test(retSrc), false, "列表 DTO 严禁返回 inputMaterial");
    assert.strictEqual(/Prompt/.test(retSrc), false, "列表 DTO 严禁返回 Prompt/系统提示");
    assert.strictEqual(/artifact/.test(retSrc), false, "列表 DTO 严禁返回 artifact/artifact.content");
  });
});

describe("R3.4 确定性验收：工作台历史任务详情链路", () => {
  it("IX-10. 历史任务点击必须调用 openHistoryTaskDetail（task_detail），不得仅用列表摘要渲染结果", () => {
    assert.ok(/onClick=\{\(\) => openHistoryTaskDetail\(t\)\}/.test(workspaceSrc), "历史任务点击必须调用 openHistoryTaskDetail");
    assert.ok(/action=task_detail&taskId=/.test(workspaceSrc), "openHistoryTaskDetail 必须请求 task_detail");
    assert.ok(/setSelectedTask\(\{ \.\.\.t, authError: true/.test(workspaceSrc), "task_detail 403 必须进入 authError 真实状态（并清空旧成果/合同/执行字段）");
    assert.ok(/setSelectedTask\(\{ \.\.\.t, notFound: true/.test(workspaceSrc), "task_detail 404 必须进入 notFound 真实状态（并清空旧成果/合同/执行字段）");
  });
});

describe("R3.4/R3.5 确定性验收：默认组件数据源范围收口（仅列表兜底/自愈路径，不阻断显式组件执行）", () => {
  it("IX-13a. DEFAULT_COMPONENT_SOURCE_MISSING 稳定错误码仍由真正需要默认组件集合的路径返回（列表兜底/自愈）", () => {
    // 默认组件数据源（componentcatalog.isDefault=true && isPublished=true）的唯一权威来源调用仍存在于 route
    assert.ok(
      /getDefaultCatalogComponentIds\(\)/.test(routeSrc),
      "route 仍在组件列表兜底/空间自愈路径调用 getDefaultCatalogComponentIds()",
    );
    assert.ok(
      /code: "DEFAULT_COMPONENT_SOURCE_MISSING"/.test(routeSrc),
      "默认源缺失必须返回稳定 code=DEFAULT_COMPONENT_SOURCE_MISSING（不转为无 code 普通 500）",
    );
    assert.ok(
      /系统默认组件策略缺少已批准数据源/.test(routeSrc),
      "默认源缺失必须返回稳定中文错误说明",
    );
  });

  it("IX-13b. simulate 明确绑定的组件执行不得被无关默认装配配置阻断（不再无条件依赖默认组件集合）", () => {
    const simIdx = routeSrc.indexOf('if (action === "simulate")');
    const afterSim = routeSrc.indexOf("const comp = await prisma.componentcatalog.findUnique", simIdx);
    const simBlock = routeSrc.slice(simIdx, afterSim > simIdx ? afterSim : simIdx + 5000);
    assert.strictEqual(
      /getDefaultCatalogComponentIds/.test(simBlock),
      false,
      "simulate 分支不得无条件调用 getDefaultCatalogComponentIds（默认装配缺失错误仅属于列表兜底/自愈路径）",
    );
    assert.strictEqual(
      /DEFAULT_COMPONENT_SOURCE_MISSING/.test(simBlock),
      false,
      "simulate 分支不得处理 DEFAULT_COMPONENT_SOURCE_MISSING（避免误阻断显式组件执行）",
    );
  });

  it("IX-13c. 不存在固定组件数组回退（严禁硬编码默认组件数组）", () => {
    assert.strictEqual(
      routeSrc.includes('["C01", "C02", "C07", "C11", "C12"]'),
      false,
      "route 严禁出现硬编码默认组件数组",
    );
  });

  it("IX-13d. 组件列表兜底路径（无绑定记录时）必须调用 getDefaultCatalogComponentIds 并在缺失时阻断", () => {
    const listIdx = routeSrc.indexOf("boundComponentMap.size === 0");
    assert.ok(listIdx > 0, "必须存在受限组件列表无绑定记录时的兜底分支");
    const listBlock = routeSrc.slice(listIdx, listIdx + 600);
    assert.ok(
      /getDefaultCatalogComponentIds\(\)/.test(listBlock),
      "无绑定记录兜底分支必须调用 getDefaultCatalogComponentIds()",
    );
  });
});
