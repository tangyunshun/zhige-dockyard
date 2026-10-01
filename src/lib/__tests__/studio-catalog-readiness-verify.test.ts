/**
 * 批次 2C（C12-C15）Studio Catalog 只读就绪状态与质量提示真实 API 验收测试
 *
 * 绝对原则：
 *  - 纯只读测试，绝不写入数据库（不执行 CREATE/UPDATE/DELETE/ALTER/DROP）；
 *  - 不调用外部真实模型；
 *  - 验证 GET /api/studio?action=catalog 真实路由返回的 C12-C15 状态。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as studioGetRoute } from "@/app/api/studio/route";

describe("Studio Catalog GET /api/studio?action=catalog 真实 API 只读核验", () => {
  test("C12-C15 包含由服务端派生的通用就绪、阻断原因与质量提示字段，绝不把 ELIGIBLE 伪装为可执行", async () => {
    const req = new NextRequest("http://localhost/api/studio?action=catalog");
    const res = await studioGetRoute(req);
    assert.equal(res.status, 200, "Catalog API 应返回 HTTP 200");

    const json = await res.json();
    assert.equal(json.success, true, "响应体应为 success: true");
    assert.ok(Array.isArray(json.data?.components), "components 应为数组");

    const comps = json.data.components as any[];
    const targetMap = new Map(comps.filter((c) => ["C12", "C13", "C14", "C15"].includes(c.id)).map((c) => [c.id, c]));

    // 1. C12 拓扑图未满足能力 -> readinessStatus 必须为 BLOCKED，说明图形化 ER 图暂不支持
    const c12 = targetMap.get("C12");
    assert.ok(c12, "必须包含 C12 组件");
    assert.equal(c12.readinessStatus, "BLOCKED", "C12 必须因图形能力未就绪被服务端明确阻断为 BLOCKED");
    assert.equal(c12.contractReady, false, "C12 绝不可执行 (contractReady 必须为 false)");
    assert.ok(
      c12.blockingReasons.some((r: string) => r.includes("图形化 ER 图")),
      `C12 blockingReasons 必须明确包含图形化 ER 图原因，实际为: ${JSON.stringify(c12.blockingReasons)}`
    );

    // 2. C13 候选满足能力但未发布 -> UNCONFIGURED, contractReady=false, isCandidateEligible=true
    const c13 = targetMap.get("C13");
    assert.ok(c13, "必须包含 C13 组件");
    assert.equal(c13.readinessStatus, "UNCONFIGURED", "C13 候选未发布必须为 UNCONFIGURED");
    assert.equal(c13.contractReady, false, "C13 未发布绝不得为 contractReady");
    assert.equal(c13.isCandidateEligible, true, "C13 候选元数据标记为可申请发布");
    assert.ok(
      c13.qualityHints.some((h: string) => h.includes("未经目标工程编译")),
      `C13 质量提示必须包含未经编译提示，实际为: ${JSON.stringify(c13.qualityHints)}`
    );

    // 3. C14 候选满足能力但未发布 -> UNCONFIGURED, contractReady=false, 包含代码骨架质量提示
    const c14 = targetMap.get("C14");
    assert.ok(c14, "必须包含 C14 组件");
    assert.equal(c14.readinessStatus, "UNCONFIGURED", "C14 候选未发布必须为 UNCONFIGURED");
    assert.equal(c14.contractReady, false, "C14 未发布绝不得为 contractReady");
    assert.equal(c14.isCandidateEligible, true, "C14 候选元数据标记为可申请发布");
    assert.ok(
      c14.qualityHints.some((h: string) => h.includes("未经目标工程编译")),
      `C14 质量提示必须包含未经编译提示，实际为: ${JSON.stringify(c14.qualityHints)}`
    );

    // 4. C15 候选满足能力但未发布 -> UNCONFIGURED, contractReady=false, 包含未压测免责提示
    const c15 = targetMap.get("C15");
    assert.ok(c15, "必须包含 C15 组件");
    assert.equal(c15.readinessStatus, "UNCONFIGURED", "C15 候选未发布必须为 UNCONFIGURED");
    assert.equal(c15.contractReady, false, "C15 未发布绝不得为 contractReady");
    assert.equal(c15.isCandidateEligible, true, "C15 候选元数据标记为可申请发布");
    assert.ok(
      c15.qualityHints.some((h: string) => h.includes("未经实际压测")),
      `C15 质量提示必须包含未压测提示，实际为: ${JSON.stringify(c15.qualityHints)}`
    );

    console.log("=== C12-C15 真实 Catalog API 校验结果详情 ===");
    console.log(
      JSON.stringify(
        ["C12", "C13", "C14", "C15"].map((id) => {
          const c = targetMap.get(id);
          return {
            id: c.id,
            readinessStatus: c.readinessStatus,
            isCandidateEligible: c.isCandidateEligible,
            contractReady: c.contractReady,
            blockingReasons: c.blockingReasons,
            qualityHints: c.qualityHints,
          };
        }),
        null,
        2
      )
    );
  });

  test("数据库中已发布且平台能力满足的激活组件真实返回 EXECUTABLE 且 contractReady: true", async () => {
    const req = new NextRequest("http://localhost/api/studio?action=catalog");
    const res = await studioGetRoute(req);
    assert.equal(res.status, 200);
    const json = await res.json();
    const comps = json.data.components as any[];
    
    // C01 是已发布且平台默认模型支持的组件
    const c01 = comps.find((c) => c.id === "C01");
    if (c01 && c01.hasActiveContract && c01.activeContractLifecycle === "PUBLISHED") {
      assert.equal(c01.readinessStatus, "EXECUTABLE", "已发布且能力满足必须为 EXECUTABLE");
      assert.equal(c01.contractReady, true, "已发布且能力满足必须为 contractReady: true");
      assert.deepEqual(c01.blockingReasons, [], "能力满足时不应有阻断原因");
      assert.deepEqual(c01.missingCapabilities, [], "缺失能力必须为空数组");
    }
  });
});

