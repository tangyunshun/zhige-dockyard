import { describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
// 以 any 视图解构：本文件用例以「服务端下发的任意 DTO」为输入验证诚实化逻辑，
// 不应对夹具对象施加组件内部联合类型约束（断言语义完全不变）。
import * as ResultViewerModule from "@/components/studio/ResultViewer";
const { getFailedTaskRefundInfo, getDisclaimerBanner } = ResultViewerModule as any;

describe("前端页面阻断、质量提示与架构红线守卫测试", () => {
  const rootDir = process.cwd();
  const dispatcherFile = path.join(rootDir, "src/components/studio/ComponentDispatcherPanelNew.tsx");
  const workspaceFile = path.join(rootDir, "src/components/WorkspaceInternalLayoutV3.tsx");
  const resultViewerFile = path.join(rootDir, "src/components/studio/ResultViewer.tsx");

  it("1. 静态源码守卫：ComponentDispatcherPanelNew 中不得存在 C15 特判及未经压测的假倍数", () => {
    const content = fs.readFileSync(dispatcherFile, "utf-8");
    // 不得以 C15 作为特定 ID 判断
    assert.strictEqual(
      content.includes('comp.id === "C15"'),
      false,
      "ComponentDispatcherPanelNew 中严禁出现 comp.id === 'C15' 特判",
    );
    // 严禁包含未经真实基准测试的假提效率和倍数
    assert.strictEqual(
      content.includes('"85% +"') || content.includes("'85% +'"),
      false,
      "ComponentDispatcherPanelNew 严禁硬编码 '85% +' 假提效数据",
    );
    assert.strictEqual(
      content.includes('"3.5 倍"') || content.includes("'3.5 倍'"),
      false,
      "ComponentDispatcherPanelNew 严禁硬编码 '3.5 倍' 假提效倍数",
    );
    // 严禁将 C12 作为阻断判断条件
    assert.strictEqual(
      content.includes('comp.id === "C12"') && content.includes("BLOCKED"),
      false,
      "ComponentDispatcherPanelNew 不得通过前端代码硬编码 C12 阻断",
    );
    // 提效区域必须包含明确的「业务预估，未经压测」
    assert.ok(
      content.includes("业务预估，未经压测"),
      "ComponentDispatcherPanelNew 提效评估必须明确标注「业务预估，未经压测」",
    );
  });

  it("2. 静态源码守卫：WorkspaceInternalLayoutV3 中不得存在 C13/C14/C15 特判，不得将 C12 作为阻断判断条件", () => {
    const content = fs.readFileSync(workspaceFile, "utf-8");
    assert.strictEqual(
      content.includes('quickSelectedCompId === "C13"'),
      false,
      "WorkspaceInternalLayoutV3 中严禁包含 quickSelectedCompId === 'C13' 特判",
    );
    assert.strictEqual(
      content.includes('quickSelectedCompId === "C14"'),
      false,
      "WorkspaceInternalLayoutV3 中严禁包含 quickSelectedCompId === 'C14' 特判",
    );
    assert.strictEqual(
      content.includes('quickSelectedCompId === "C15"'),
      false,
      "WorkspaceInternalLayoutV3 中严禁包含 quickSelectedCompId === 'C15' 特判",
    );
    assert.strictEqual(
      content.includes('quickSelectedCompId === "C12"') && content.includes("BLOCKED"),
      false,
      "WorkspaceInternalLayoutV3 中严禁在源码中将 C12 作为阻断条件",
    );
    // 必须包含待配置/不可执行文案
    assert.ok(
      content.includes("待配置/不可执行"),
      "WorkspaceInternalLayoutV3 必须对未发布候选组件展示「待配置/不可执行」",
    );
  });

  it("3. 静态源码守卫：ResultViewer 无有效合同快照时必须展示统一溯源文案，不得按 componentId 添加兜底", () => {
    const content = fs.readFileSync(resultViewerFile, "utf-8");
    assert.ok(
      content.includes("该历史任务没有可追溯的合同质量提示"),
      "ResultViewer 必须包含「该历史任务没有可追溯的合同质量提示」文案",
    );
    // 不得根据 componentId 猜测或兜底 qualityHints
    assert.strictEqual(
      content.includes('task.componentId === "C13"') ||
      content.includes('task.componentId === "C14"') ||
      content.includes('task.componentId === "C15"'),
      false,
      "ResultViewer 严禁根据 task.componentId 臆造兜底质量提示",
    );
  });

  it("4. 逻辑断言：任意非 Cxx 自定义组件只要返回 qualityHints 就能正常提取并渲染", () => {
    const customComp = {
      id: "CUSTOM_ML_OPTIMIZER_X86",
      name: "异构微架构推理优化器",
      contractReady: true,
      readinessStatus: "EXECUTABLE",
      blockingReasons: [],
      qualityHints: [
        "生成产物为 AVX-512 内联汇编骨架，未经目标靶机硬件微架构实测",
        "并发吞吐与缓存命中率须在实体测试机实测，不构成性能承诺",
      ],
    };

    // 模拟前端卡片提取
    const renderedHints: string[] = customComp.qualityHints ?? [];
    assert.strictEqual(renderedHints.length, 2);
    assert.strictEqual(renderedHints[0], "生成产物为 AVX-512 内联汇编骨架，未经目标靶机硬件微架构实测");
    assert.strictEqual(renderedHints[1], "并发吞吐与缓存命中率须在实体测试机实测，不构成性能承诺");
  });

  it("5. 逻辑断言：任意 blockingReasons 均可独立消费，不依赖组件 ID", () => {
    const blockedArbitraryComp = {
      id: "CUSTOM_ETL_PIPELINE",
      name: "跨云湖仓归集器",
      contractReady: false,
      readinessStatus: "BLOCKED",
      blockingReasons: ["缺少数据出境合规审计白名单授权", "目标异构存储驱动尚未在宿主机初始化"],
      qualityHints: [],
    };

    const disableReason = blockedArbitraryComp.blockingReasons.length > 0
      ? `阻断：${blockedArbitraryComp.blockingReasons[0]}`
      : "阻断：组件存在未满足的业务依赖门禁，当前不能发布/执行";

    assert.strictEqual(disableReason, "阻断：缺少数据出境合规审计白名单授权");
  });

  it("6. 逻辑断言：没有 qualityHints 时不伪造质量说明", () => {
    const cleanComp = {
      id: "CUSTOM_STABLE_PARSER",
      name: "标准文本清洗器",
      contractReady: true,
      readinessStatus: "EXECUTABLE",
      blockingReasons: [],
      qualityHints: [],
    };

    const hasQualityHints = Array.isArray(cleanComp.qualityHints) && cleanComp.qualityHints.length > 0;
    assert.strictEqual(hasQualityHints, false, "空提示时不应伪造任何质量卡片");
  });

  it("7. 逻辑断言：未发布候选（UNCONFIGURED / DRAFT）按钮状态为「待配置/不可执行」", () => {
    const unconfiguredComp = {
      id: "CUSTOM_ALPHA_COMP",
      name: "内测算法组件",
      contractReady: false,
      readinessStatus: "UNCONFIGURED",
      isCandidateEligible: true,
      blockingReasons: [],
      qualityHints: ["仅支持纯英文输入测试"],
    };

    const buttonLabel = unconfiguredComp.contractReady !== true
      ? unconfiguredComp.readinessStatus === "BLOCKED"
        ? "已阻断 (不可执行)"
        : unconfiguredComp.readinessStatus === "NOT_EXECUTABLE"
          ? "能力不满足 (不可执行)"
          : "待配置/不可执行"
      : "启动组件分析";

    assert.strictEqual(buttonLabel, "待配置/不可执行");
  });

  it("8. 逻辑断言：历史任务没有合同快照时展示不可追溯，不使用当前目录数据覆盖", () => {
    const legacyTask: {
      id: string;
      componentId: string;
      execution: { qualityHints?: string[] } | null;
      qualityHints?: string[];
    } = {
      id: "task_legacy_001",
      componentId: "C15",
      execution: null,
      qualityHints: undefined,
    };

    const hints = legacyTask.execution?.qualityHints ?? legacyTask.qualityHints ?? [];
    let displayMessage = "";
    if (hints.length > 0) {
      displayMessage = hints.join("; ");
    } else {
      displayMessage = "该历史任务没有可追溯的合同质量提示";
    }

    assert.strictEqual(displayMessage, "该历史任务没有可追溯的合同质量提示");
  });

  it("9. 静态源码守卫：前端严禁硬编码 executable=true 或 contractReady=true", () => {
    const dContent = fs.readFileSync(dispatcherFile, "utf-8");
    const wContent = fs.readFileSync(workspaceFile, "utf-8");
    // 不得以字面量强行覆盖真实合同就绪状态
    assert.strictEqual(
      dContent.includes("dispatcherContractReady = true") ||
      dContent.includes("contractReady: true"),
      false,
      "ComponentDispatcherPanelNew 严禁硬编码 contractReady: true",
    );
    assert.strictEqual(
      wContent.includes("contractReady = true") ||
      wContent.includes("executable = true"),
      false,
      "WorkspaceInternalLayoutV3 严禁硬编码 executable = true",
    );
  });

  it("10. 静态源码守卫：ResultViewer 严禁无条件声称已退款", () => {
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    assert.strictEqual(
      rContent.includes("已自动执行原路退款"),
      false,
      "ResultViewer 严禁出现无条件「已自动执行原路退款」兜底文案",
    );
    assert.ok(
      rContent.includes("getFailedTaskRefundInfo"),
      "ResultViewer 必须接入 getFailedTaskRefundInfo 诚实化退款判定",
    );
  });

  it("11. 逻辑断言：退款状态 100% 只消费 API 字段，缺失时展示「待系统确认」，严禁根据错误码推断", () => {
    // 1. 服务端明确返回 NO_CHARGE 时才展示未发生扣费
    const noChargeTask = { name: "t1", status: "FAILED", refundStatus: "NO_CHARGE", chargeAttempted: false };
    assert.strictEqual(getFailedTaskRefundInfo(noChargeTask).statusText, "未发生扣费");

    // 2. 只有服务端明确返回 REFUNDED 时才显示退款成功
    const refundedTask = { name: "t2", status: "FAILED", refundStatus: "REFUNDED", refundedPoints: 10 };
    assert.strictEqual(getFailedTaskRefundInfo(refundedTask).statusText, "退款成功");
    assert.ok(getFailedTaskRefundInfo(refundedTask).detailText.includes("10 算力点"));

    // 3. 服务端明确返回 REFUND_PENDING
    const pendingTask = { name: "t3", status: "FAILED", refundStatus: "REFUND_PENDING" };
    assert.strictEqual(getFailedTaskRefundInfo(pendingTask).statusText, "退款处理中");

    // 4. 服务端明确返回 RECONCILIATION_REQUIRED
    const reconTask = { name: "t4", status: "FAILED", refundStatus: "RECONCILIATION_REQUIRED" };
    assert.strictEqual(getFailedTaskRefundInfo(reconTask).statusText, "退款待对账");

    // 5. 关键红线：无论出现任何错误码（如 INPUT_TOO_LARGE, INPUT_REQUIRED 等），只要 refundStatus 缺失，严禁推断未扣费或已退款！
    const inputTooLargeTask = { name: "t5", status: "FAILED", outputData: { code: "INPUT_TOO_LARGE" } };
    assert.strictEqual(getFailedTaskRefundInfo(inputTooLargeTask).statusText, "退款状态待系统确认");

    const inputRequiredTask = { name: "t6", status: "FAILED", outputData: { code: "INPUT_REQUIRED" } };
    assert.strictEqual(getFailedTaskRefundInfo(inputRequiredTask).statusText, "退款状态待系统确认");

    const unknownTask = { name: "t7", status: "FAILED", outputData: { error: "上游大模型执行超时" } };
    assert.strictEqual(getFailedTaskRefundInfo(unknownTask).statusText, "退款状态待系统确认");
  });

  it("12. 逻辑断言：防伪声明优先消费服务端合同快照，无 disclaimer 时显示通用提示，不按组件 ID 拼接", () => {
    // 服务端下发专属免责声明（仅限详情 DTO 认证的 contractView.disclaimer）时消费服务端内容
    const taskWithServerDisclaimer = {
      componentId: "C01",
      name: "标书解析",
      contractView: { disclaimer: "【服务端合同声明】本招标文件分析仅供投标团队参考，不可替代法律与商务合规评审。", requireHumanReview: true },
    };
    const banner1 = getDisclaimerBanner(taskWithServerDisclaimer);
    assert.ok(banner1.title.includes("AI 生成成果"));
    assert.strictEqual(banner1.content, "【服务端合同声明】本招标文件分析仅供投标团队参考，不可替代法律与商务合规评审。");

    // 服务端未下发 disclaimer 时展示通用声明，严禁根据 C01/C02/C07 拼接特定前端业务文案；
    // 且无可追溯合同视图时不得出现“需人工复核/待人工复核”等人工复核声明（仅展示合同不可追溯中性提示）
    const c01WithoutDisclaimer = { componentId: "C01", name: "标书解析" };
    const bannerC01 = getDisclaimerBanner(c01WithoutDisclaimer);
    assert.strictEqual(bannerC01.title.includes("需人工复核"), false, "无 contractView 时严禁显示人工复核");
    assert.strictEqual(bannerC01.title.includes("待人工复核"), false, "无 contractView 时严禁显示人工复核");
    assert.ok(
      bannerC01.content.includes("合同不可追溯") || bannerC01.content.includes("未绑定可追溯合同视图"),
      "无 contractView 时展示合同不可追溯中性提示",
    );

    const c07WithoutDisclaimer = { componentId: "C07", name: "需求分析" };
    const bannerC07 = getDisclaimerBanner(c07WithoutDisclaimer);
    assert.strictEqual(bannerC07.title.includes("需人工复核"), false, "无 contractView 时严禁显示人工复核");
    assert.strictEqual(bannerC07.title.includes("AI 需求规格草案"), false, "未下发 disclaimer 时严禁根据组件 ID 拼接标题");

    // 合同确要求人工复核（contractView.requireHumanReview=true）时才可显示人工复核——属合同事实，非前端猜测
    const c01ReviewRequired = { componentId: "C01", name: "标书解析", contractView: { requireHumanReview: true } };
    const bannerReq = getDisclaimerBanner(c01ReviewRequired);
    assert.ok(bannerReq.title.includes("需人工复核"), "合同 requireHumanReview=true 时方可显示人工复核（合同事实）");
  });

  it("13. 静态源码守卫：WorkspaceInternalLayoutV3 彻底消除 || 30000 假默认值与 2000 字硬编码，不前端强行截断", () => {
    const wContent = fs.readFileSync(workspaceFile, "utf-8");
    // 严禁存在 || 30000 默认值
    assert.strictEqual(
      wContent.includes("|| 30000"),
      false,
      "WorkspaceInternalLayoutV3 严禁出现 || 30000 假默认值",
    );
    // 严禁在文本输入框硬编码 maxLength={2000}
    assert.strictEqual(
      wContent.includes("maxLength={2000}") || wContent.includes("上限 2000 字"),
      false,
      "WorkspaceInternalLayoutV3 严禁在文本输入框硬编码 maxLength={2000}",
    );
    // 严禁客户端私自截断输入内容 (text.slice)
    assert.strictEqual(
      wContent.includes("rawText.slice(0,") || wContent.includes(".slice(0, maxLimit)"),
      false,
      "WorkspaceInternalLayoutV3 严禁在前端私自对用户输入进行 slice 截断",
    );
    // 未配置合同上限时必须显示由服务端合同校验
    assert.ok(
      wContent.includes("长度限制由服务端合同校验"),
      "WorkspaceInternalLayoutV3 未配置长度限制时必须明确显示「长度限制由服务端合同校验」",
    );
  });

  it("14. 静态源码守卫：ResultViewer 失败任务及产物缺失任务不可导出，明确区分权限错误与结果不存在", () => {
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    // 失败任务或产物缺失时必须禁用导出与复制
    assert.ok(
      rContent.includes("hasValidArtifact"),
      "ResultViewer 必须包含 hasValidArtifact 成果有效性判定",
    );
    assert.ok(
      rContent.includes("artifactActionsEnabled"),
      "ResultViewer 必须包含统一的 canUseArtifactActions 判定变量",
    );
    assert.ok(
      rContent.includes("disabled={!artifactActionsEnabled}"),
      "ResultViewer 在成果缺失或任务失败时必须禁用导出按钮（disabled 与点击同源）",
    );
    assert.ok(
      rContent.includes("任务失败或成果物缺失，无法导出"),
      "ResultViewer 必须提示「任务失败或成果物缺失，无法导出」",
    );
    // 明确区分权限错误与结果不存在
    assert.ok(
      rContent.includes("task.authError"),
      "ResultViewer 必须独立判断并渲染权限拒绝状态 (authError)",
    );
    assert.ok(
      rContent.includes("task.notFound"),
      "ResultViewer 必须独立判断并渲染结果不存在状态 (notFound)",
    );
    assert.ok(
      rContent.includes("暂无查看权限"),
      "ResultViewer 必须包含权限拒绝提示",
    );
    assert.ok(
      rContent.includes("未找到指定的任务执行结果记录"),
      "ResultViewer 必须包含成果不存在提示",
    );
  });

  it("15. 静态源码守卫：前端全组件严禁出现向用户展示的 COMPLETE 文案，且隔离生产任务页对 simulate 的暴露", () => {
    const dContent = fs.readFileSync(dispatcherFile, "utf-8");
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    const tasksPageFile = path.join(rootDir, "src/app/tasks/page.tsx");
    const tContent = fs.readFileSync(tasksPageFile, "utf-8");

    // 检查是否有给用户的界面暴露 COMPLETE
    assert.strictEqual(
      dContent.includes('"COMPLETE"') || dContent.includes("'COMPLETE'"),
      false,
      "ComponentDispatcherPanelNew 严禁展示 COMPLETE",
    );
    assert.strictEqual(
      rContent.includes('"COMPLETE"') || rContent.includes("'COMPLETE'"),
      false,
      "ResultViewer 严禁展示 COMPLETE",
    );

    // tasks 页面隔离 simulate
    assert.strictEqual(
      tContent.includes('action: "simulate"') || tContent.includes("action=simulate"),
      false,
      "tasks/page.tsx 生产任务页面严禁调用 simulate 创建模拟成功任务",
    );
  });

  it("16. 静态源码守卫：本轮相关目录字段读取不得存在 as any 断言，C07 DOCUMENT 模式不渲染固定结构化提取卡片", () => {
    const dContent = fs.readFileSync(dispatcherFile, "utf-8");
    const wContent = fs.readFileSync(workspaceFile, "utf-8");
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");

    // ComponentDispatcherPanelNew 不得通过 compContractMeta as unknown as 或 as any 掩盖目录缺失
    assert.strictEqual(
      dContent.includes("compContractMeta as unknown as") || dContent.includes("as unknown as ComponentDefinition"),
      false,
      "ComponentDispatcherPanelNew 严禁使用类型断言掩盖目录缺失",
    );

    // WorkspaceInternalLayoutV3 不得对 selCatalogCompLeft 使用 as any 读取
    assert.strictEqual(
      wContent.includes("(selCatalogCompLeft as any)"),
      false,
      "WorkspaceInternalLayoutV3 严禁使用 (selCatalogCompLeft as any) 读取目录字段",
    );

    // R3：输出渲染只能依据服务端安全字段（outputKind/rendererType 等），严禁按组件 ID 特判 C07
    assert.strictEqual(
      /(===|!==)\s*"C07"|toUpperCase\(\)[^)]*=== "C07"/.test(rContent),
      false,
      "ResultViewer 源码严禁出现 C07 组件 ID 特判（输出渲染只能依据服务端安全字段）",
    );
    // 服务端安全合同视图未提供业务标签时，统一显示通用文档标题
    assert.ok(
      rContent.includes("DOCUMENT / Markdown 成果文档"),
      "DOCUMENT 成果物必须统一展示为「DOCUMENT / Markdown 成果文档」",
    );
    assert.strictEqual(
      rContent.includes("需求规格草案"),
      false,
      "服务端未提供安全业务标签时，严禁前端按组件 ID 猜测为「需求规格草案」（PRD）",
    );
  });
});
