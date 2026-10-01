/**
 * CORE-3-R3 §八.13：C07（及全链路）Token 与算力点单位展示专项测试。
 *
 * 口径（§六）：
 *  - estimatedModelTokens / usage.inputTokens / outputTokens / totalTokens = 模型 Token（用量度量）
 *  - estimatedPoints / actualPoints / pointledger.points = 算力点（计费货币）
 *  - 未经批准不得做数学换算，不得把 1500 Token 显示成 1500 点，也不得把 100 点显示成 100 Token
 *  - ESTIMATED_COMPATIBILITY 必须明确提示「按预估算力点扣减，未按真实 Token 精确结算」
 *
 * 本测试为确定性源码守卫：不连数据库、不调用模型、不写账务。
 */
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf-8");

const ROUTE_SRC = read("src/app/api/studio/route.ts");
const WORKSPACE_SRC = read("src/components/WorkspaceInternalLayoutV3.tsx");
const RESULT_VIEWER_SRC = read("src/components/studio/ResultViewer.tsx");
const TASKS_PAGE_SRC = read("src/app/tasks/page.tsx");

describe("C07 Token 与算力点单位不得混用（§六）", () => {
  it("1. 路由分别持久化 Token 用量与算力点，且算力点取自扣点结果而非合同 estimatedTokens", () => {
    // Token 用量
    assert.ok(/inputTokens:/.test(ROUTE_SRC) && /outputTokens:/.test(ROUTE_SRC) && /totalTokens:/.test(ROUTE_SRC),
      "必须分别记录 usage input/output/totalTokens");
    // 算力点：estimatedPoints 来自本次扣点结果 deductTokens，严禁取合同 estimatedTokens
    assert.ok(/estimatedPoints:\s*deductTokens/.test(ROUTE_SRC),
      "estimatedPoints 必须来自本次实际扣点结果 deductTokens");
    assert.ok(!/estimatedPoints:\s*[^,\n]*billingPolicy\.estimatedTokens/.test(ROUTE_SRC),
      "严禁把合同 billingPolicy.estimatedTokens（模型 Token）当作算力点写入 estimatedPoints");
    assert.ok(/actualPoints:/.test(ROUTE_SRC), "必须存在 actualPoints 实际结算字段");
    assert.ok(/billingMode:/.test(ROUTE_SRC), "必须记录 billingMode");
  });

  it("2. Workspace 不得把 estimatedModelTokens 显示为「点」", () => {
    assert.ok(!/estimatedModelTokens[^}\n]*\}\s*点/.test(WORKSPACE_SRC),
      "estimatedModelTokens 是模型 Token 估算，严禁拼接为「点」");
    assert.ok(/预估模型 Token/.test(WORKSPACE_SRC),
      "预估模型 Token 必须明确标注为 Token");
  });

  it("3. ResultViewer 算力点变量不得沿用 tokenCost 命名，且必须给出估算兼容提示", () => {
    assert.ok(!/\btokenCost\b/.test(RESULT_VIEWER_SRC),
      "承载算力点的变量严禁命名为 tokenCost（跨单位命名）");
    assert.ok(/pointsCost/.test(RESULT_VIEWER_SRC), "应使用 pointsCost 等点语义命名");
    assert.ok(/ESTIMATED_COMPATIBILITY/.test(RESULT_VIEWER_SRC) &&
      /按预估算力点扣减，未按真实 Token 精确结算/.test(RESULT_VIEWER_SRC),
      "ESTIMATED_COMPATIBILITY 必须明确提示按预估算力点扣减");
  });

  it("4. tasks 页面不得把算力点合计标为 Tokens", () => {
    assert.ok(!/totalTokensUsed/.test(TASKS_PAGE_SRC),
      "累加算力点的合计严禁命名为 totalTokensUsed");
    assert.ok(/totalPoints/.test(TASKS_PAGE_SRC), "应使用 totalPoints 等点语义命名");
  });

  it("5. 未经批准不得出现 Token→算力点的数学换算", () => {
    // 严禁把 Token 数直接当作点数消费（无换算规则时不得换算）
    assert.ok(!/estimatedPoints:\s*[^,\n]*estimatedTokens\b/.test(ROUTE_SRC),
      "未经批准不得用 estimatedTokens 直接充当 estimatedPoints");
  });
});
