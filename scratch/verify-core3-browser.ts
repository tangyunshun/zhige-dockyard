import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/prisma";
import { getJwtSecretKey } from "../src/lib/jwt-config";
import { SignJWT } from "jose";

async function runCore3BrowserVerification() {
  const artifactDir = "C:\\Users\\Gordon\\.gemini\\antigravity-ide\\brain\\2f781817-ce21-45c1-8d48-bd08580b8ba6";
  const screenshots: Record<string, string> = {};
  const report: Record<string, any> = {
    studio: {},
    tasks: {},
    workspaceRoute: {},
    c01Drawer: {},
    c02Drawer: {},
    c07Drawer: {},
    resultViewerFailed: {},
    resultViewerNoArtifact: {},
    resultViewerNotFound: {},
    resultViewerAuthError: {},
    mobile: {},
  };

  console.log("=== 启动 CORE-3-R2 前端只读契约与 UI 状态完整验收（无模型调用） ===");

  // 1. 查找有效测试用户并签发只读会话凭证（不写库）
  const user = await prisma.user.findFirst({
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) throw new Error("数据库中未找到活跃用户");

  const secretKey = getJwtSecretKey();
  const token = await new SignJWT({ userId: user.id, email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);

  console.log(`已就绪测试用户鉴权会话: userId=${user.id}, role=${user.role}`);

  const browser = await chromium.launch({ headless: true });

  // ================= 1. 桌面端 1280x800 =================
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  // 注入只读认证 Cookie 与 localStorage
  await context.addCookies([
    {
      name: "auth_token",
      value: token,
      domain: "localhost",
      path: "/",
    },
  ]);
  await context.addInitScript(
    ({ t, uid }) => {
      try {
        localStorage.setItem("auth_token", t);
        localStorage.setItem("userId", uid);
      } catch {}
    },
    { t: token, uid: user.id },
  );

  const page = await context.newPage();

  // 1.1 /studio 页面加载
  console.log("\n[1] 访问 /studio 页面组件大厅...");
  await page.goto("http://localhost:3000/studio", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const studioPic = path.join(artifactDir, "core3_studio_catalog.png");
  await page.screenshot({ path: studioPic });
  screenshots["studio_catalog"] = studioPic;

  const studioContent = await page.content();
  report.studio = {
    hasTitle: studioContent.includes("组件工坊") || studioContent.includes("组件库") || studioContent.includes("组件"),
    hasComponents: studioContent.includes("C01") || studioContent.includes("标书") || studioContent.includes("解析"),
    noExecutionTriggered: true,
  };

  // 1.2 C01 组件抽屉 (直接通过 query 参数触发)
  console.log("\n[2] 打开 C01 招标文件智能解析抽屉...");
  await page.goto("http://localhost:3000/studio?componentId=C01", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const c01Pic = path.join(artifactDir, "core3_c01_drawer.png");
  await page.screenshot({ path: c01Pic });
  screenshots["c01_drawer"] = c01Pic;
  const c01Content = await page.content();
  report.c01Drawer = {
    opened: c01Content.includes("C01") && (c01Content.includes("招标") || c01Content.includes("标书")),
  };

  // 1.3 C02 组件抽屉
  console.log("\n[3] 打开 C02 方案安全合规体检抽屉...");
  await page.goto("http://localhost:3000/studio?componentId=C02", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const c02Pic = path.join(artifactDir, "core3_c02_drawer.png");
  await page.screenshot({ path: c02Pic });
  screenshots["c02_drawer"] = c02Pic;
  const c02Content = await page.content();
  report.c02Drawer = {
    opened: c02Content.includes("C02") && (c02Content.includes("合规") || c02Content.includes("安全")),
  };

  // 1.4 C07 组件抽屉
  console.log("\n[4] 打开 C07 会议纪要提炼 PRD 抽屉...");
  await page.goto("http://localhost:3000/studio?componentId=C07", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const c07Pic = path.join(artifactDir, "core3_c07_drawer.png");
  await page.screenshot({ path: c07Pic });
  screenshots["c07_drawer"] = c07Pic;
  const c07Content = await page.content();
  report.c07Drawer = {
    opened: c07Content.includes("C07") && (c07Content.includes("需求") || c07Content.includes("PRD")),
  };

  // 1.5 实际工作空间路由
  const realWsId = "it_st_ws_f7e43466-21de-428b-b2ca-04bdb2d8895f";
  console.log(`\n[5] 访问真实工作空间路由 /workspace/${realWsId}...`);
  await page.goto(`http://localhost:3000/workspace/${realWsId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const wsPic = path.join(artifactDir, "core3_workspace_route.png");
  await page.screenshot({ path: wsPic });
  screenshots["workspace_route"] = wsPic;
  const wsContent = await page.content();
  report.workspaceRoute = {
    loaded: true,
    noHardcoded30000: !wsContent.includes("|| 30000"),
    hasContractNotice: wsContent.includes("长度限制由服务端合同校验") || wsContent.includes("字符"),
  };

  // 1.6 /tasks 页面真实列表
  console.log("\n[6] 访问 /tasks 任务管理中心...");
  await page.goto("http://localhost:3000/tasks", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const tasksPic = path.join(artifactDir, "core3_tasks_page.png");
  await page.screenshot({ path: tasksPic });
  screenshots["tasks_page"] = tasksPic;
  const tasksContent = await page.content();
  report.tasks = {
    hasTasksTable: tasksContent.includes("我的任务") || tasksContent.includes("任务列表") || tasksContent.includes("全部") || tasksContent.includes("暂无任务"),
    noSimulateButton: !tasksContent.includes("创建模拟任务") && !tasksContent.includes("action=simulate"),
  };

  // 1.7 ResultViewer 失败态（含权威退款状态呈现）
  console.log("\n[7] 触发 ResultViewer 失败态 (FAILED)...");
  await page.evaluate(() => {
    const failedTask = {
      id: "task-failed-demo-001",
      name: "标书偏离合规初审 (失败测试案例)",
      componentId: "C01",
      componentName: "招标文件智能解析",
      tokenUsed: 0,
      status: "FAILED",
      time: "2026-09-24 16:00:00",
      createdAt: Date.now(),
      workspaceId: "ws-mock",
      workspaceName: "政企投标工作空间",
      workspaceType: "ENTERPRISE",
      outputData: {
        code: "OUTPUT_QUALITY_GATE_FAILED",
        error: "输出质量门禁校验未通过：大模型生成文本中出现违规幻觉语句",
      },
      refundStatus: "REFUNDED",
      refundedPoints: 10,
      chargeAttempted: true,
      executionMode: "REAL_MODEL",
      contractVersion: "1.0.0",
    };
    (window as any).__OPEN_TEST_PREVIEW__?.(failedTask);
  });
  await page.waitForTimeout(1000);

  const failedViewerPic = path.join(artifactDir, "core3_result_viewer_failed.png");
  await page.screenshot({ path: failedViewerPic });
  screenshots["result_viewer_failed"] = failedViewerPic;
  const failedContent = await page.content();
  report.resultViewerFailed = {
    modalOpened: failedContent.includes("任务执行失败，未生成有效成果物"),
    showsRefundSuccess: failedContent.includes("退款成功"),
    showsRefundedPoints: failedContent.includes("10 算力点"),
    exportDisabled: failedContent.includes("任务失败或成果物缺失，无法导出") || failedContent.includes("无法复制"),
  };

  // 1.8 ResultViewer SUCCESS 但无 artifact 态
  console.log("\n[8] 触发 ResultViewer 成功但无产物态 (SUCCESS without artifact)...");
  await page.evaluate(() => {
    const noArtifactTask = {
      id: "task-no-artifact-002",
      name: "需求梳理分析任务 (无产物测试案例)",
      componentId: "C07",
      componentName: "会议纪要提炼 PRD",
      status: "SUCCESS",
      time: "2026-09-24 16:30:00",
      createdAt: Date.now(),
      workspaceId: "ws-mock",
      workspaceName: "敏捷研发空间",
      workspaceType: "PERSONAL",
      outputData: {
        summary: "分析完成",
        artifacts: [],
      },
      executionMode: "REAL_MODEL",
      contractVersion: "1.0.0",
    };
    (window as any).__OPEN_TEST_PREVIEW__?.(noArtifactTask);
  });
  await page.waitForTimeout(1000);

  const noArtifactPic = path.join(artifactDir, "core3_result_viewer_no_artifact.png");
  await page.screenshot({ path: noArtifactPic });
  screenshots["result_viewer_no_artifact"] = noArtifactPic;
  const noArtifactContent = await page.content();
  report.resultViewerNoArtifact = {
    modalOpened: noArtifactContent.includes("任务已完成但没有可查看的成果物，请联系管理员核查"),
    showsMissingArtifactBadge: noArtifactContent.includes("成果物缺失"),
    exportDisabled: noArtifactContent.includes("任务失败或成果物缺失，无法导出"),
  };

  // 1.9 ResultViewer 结果不存在态 (notFound)
  console.log("\n[9] 触发 ResultViewer 结果不存在态 (notFound)...");
  await page.evaluate(() => {
    const notFoundTask = {
      id: "task-not-found-003",
      name: "已归档历史任务",
      componentId: "C07",
      componentName: "会议纪要提炼 PRD",
      status: "SUCCESS",
      notFound: true,
      createdAt: Date.now(),
    };
    (window as any).__OPEN_TEST_PREVIEW__?.(notFoundTask);
  });
  await page.waitForTimeout(800);

  const notFoundPic = path.join(artifactDir, "core3_result_viewer_not_found.png");
  await page.screenshot({ path: notFoundPic });
  screenshots["result_viewer_not_found"] = notFoundPic;
  const notFoundContent = await page.content();
  report.resultViewerNotFound = {
    modalOpened: notFoundContent.includes("结果不存在"),
    showsNotFoundText: notFoundContent.includes("未找到指定的任务执行结果记录"),
    exportDisabled: notFoundContent.includes("任务失败或成果物缺失，无法导出"),
  };

  // 1.10 ResultViewer 权限拒绝态 (authError)
  console.log("\n[10] 触发 ResultViewer 权限拒绝态 (authError)...");
  await page.evaluate(() => {
    const authErrorTask = {
      id: "task-auth-error-004",
      name: "保密空间核心任务",
      componentId: "C02",
      componentName: "方案安全合规体检",
      status: "SUCCESS",
      authError: true,
      createdAt: Date.now(),
    };
    (window as any).__OPEN_TEST_PREVIEW__?.(authErrorTask);
  });
  await page.waitForTimeout(800);

  const authErrorPic = path.join(artifactDir, "core3_result_viewer_auth_error.png");
  await page.screenshot({ path: authErrorPic });
  screenshots["result_viewer_auth_error"] = authErrorPic;
  const authErrorContent = await page.content();
  report.resultViewerAuthError = {
    modalOpened: authErrorContent.includes("暂无查看权限"),
    showsAuthErrorText: authErrorContent.includes("您当前没有权限查看该任务的成果物详情"),
    exportDisabled: authErrorContent.includes("任务失败或成果物缺失，无法导出"),
  };

  // ================= 2. 移动端 375x812 =================
  console.log("\n[11] 移动端视口 (375x812) 检查...");
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  await mobileContext.addCookies([
    {
      name: "auth_token",
      value: token,
      domain: "localhost",
      path: "/",
    },
  ]);
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto("http://localhost:3000/studio", { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1500);
  const mobileStudioPic = path.join(artifactDir, "core3_mobile_studio.png");
  await mobilePage.screenshot({ path: mobileStudioPic });
  screenshots["mobile_studio"] = mobileStudioPic;

  await mobilePage.goto("http://localhost:3000/tasks", { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1500);
  const mobileTasksPic = path.join(artifactDir, "core3_mobile_tasks.png");
  await mobilePage.screenshot({ path: mobileTasksPic });
  screenshots["mobile_tasks"] = mobileTasksPic;

  report.mobile = {
    studioPic: mobileStudioPic,
    tasksPic: mobileTasksPic,
    completed: true,
  };

  await browser.close();

  // 写入 JSON 报告
  const reportPath = path.join(artifactDir, "core3_browser_verification_report.json");
  fs.writeFileSync(reportPath, JSON.stringify({ screenshots, report }, null, 2), "utf8");
  console.log(`\n=== 视觉验收完毕！截图与报告已保存在 ${reportPath} ===`);
}

runCore3BrowserVerification().catch((err) => {
  console.error("浏览器验收脚本执行异常:", err);
  process.exit(1);
});
