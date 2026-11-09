// 临时脚本：生成 P14 收口交付物（保留 history/ 中此前版本）
const fs = require("fs");
const { execSync } = require("child_process");
const D = "docs/reviews/full-plan-dispatch-2026-11-08/deliverables/P14/";
const changed = JSON.parse(fs.readFileSync("scratch/changed-files.json", "utf8"));
const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const realTime = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace(" ", "T") + "+08:00";

// ── final-manifest.json ──
fs.writeFileSync(D + "final-manifest.json", JSON.stringify({
  generatedAtReal: realTime,
  baselineHead: "6d9f68b403798a8243f11eeb36a587916c4deb13",
  currentHead: head,
  headNote: "本轮为工作区改动（未提交）；currentHead 为基线提交，工作区相对基线的逐文件改动与 SHA 如下",
  changedFiles: changed,
  protectedEvidence: {
    restoredDeletedReviewMarkdown: 133,
    note: "133 个被误删的审核/原方案 Markdown 已按 git HEAD 逐路径恢复（未做全仓 restore）；旧独立审核目录未修改",
    priorAuditAlterations: "9 个被改写旧审核测试中：payment/security 旧版完好；byo/pricing/verification 在 unified-independent-review 目录存在第三版本（非旧版）；init-diagnostics/login/mailer/reset 旧版从未入 git（原始 blob 不可恢复，不伪造）——事实声明见 final-report.md §证据",
  },
  schemaChanges: ["prisma/schema.prisma: +VerificationSendClaim（发送预约身份绑定）+PasswordResetClaim（改密授权认领）——均为离线草案，未执行迁移"],
}, null, 1));

// ── final-tests.json ──
fs.writeFileSync(D + "final-tests.json", JSON.stringify({
  generatedAtReal: realTime,
  commands: [
    {
      name: "formal-41-file-regression",
      command: "npx vitest run --no-color <test-targets.json 41 文件清单>",
      files: 41, passed: 792, failed: 0, exitCode: 0,
      ranAt: "2026-11-10T00:27+08:00",
      note: "本轮回归通过；上一轮审核的 1 项 DOCX 预览 504 时间敏感失败在本轮全量组合中未复现（保留上轮首次结果记录于审核目录，不据此次绿结果否认上轮事实）",
    },
    { name: "typecheck", command: "npx tsc --noEmit --incremental false -p tsconfig.json", exitCode: 0 },
  ],
  fixtureBoundaries: "DB/fs/SMS/SMTP/支付/模型全部隔离替身；唯一约束(P2002)/条件count/版本CAS/惰性执行/回滚在替身中真实求值；席位履约实际运行统一履约+席位服务（r0b/r0y）；未做真实 MySQL/支付互通/供应商验收",
}, null, 1));

// ── handoff.json ──
fs.writeFileSync(D + "handoff.json", JSON.stringify({
  state: "DELIVERED_PENDING_INDEPENDENT_REVIEW",
  at: realTime,
  finalVersion: { baseline: "6d9f68b", workingTreeChanges: 29, committed: false },
  executorStoppedWriting: true,
  completedThisRound: ["U04 席位交易唯一认领+晚到账原子事实", "U02 发送预约身份/幂等回退/consume锁/fail-closed/原子签发/失败计数并发安全/ip-actor", "U02 reset 密码持久授权认领（提交一致性）", "U03 mailer 精确收件人/无确认unknown/未配置=failed", "U05 Webhooks 及 5 个工作空间入口完整会话验证", "U05 登录回跳净化（外站/协议相对/反斜杠/编码绕过）", "U09-6 调价审计事务内真实计数", "U06 BYO query 参与目的地比较", "F14 无停止证据不腾槽 + 退出证据回收 + File.size 预检"],
  remainingFailed: [
    { id: "U01/U10（原6/7/8）", item: "生产共享成本预约后端接入真实入口；持久 task/attempt/供应商事实与费用恢复；来源退款接真实 ledger/hold", status: "FAILED", reason: "本轮未实现——需要跨 Studio/Open/估价/多步重试的接线与生产数据模型设计，剩余工程量大，未在本次交付内完成" },
    { id: "U05（原9）", item: "企业撤权全入口矩阵/岗位私有统计收口；首页 60+/300% 不实宣传与首次价值页面", status: "FAILED", reason: "本轮仅完成 Webhooks+5 入口会话一致与登录回跳净化；撤权矩阵与首页改版未实现" },
    { id: "U11/U12（原10/11/12）", item: "运营恢复接真实后台（持久可信事实）；指标接 API 与真实经营口径", status: "FAILED", reason: "本轮未实现" },
    { id: "原13/14", item: "迁移历史 checksum/已部署兼容核实；页面实际旅程证据", status: "ENVIRONMENT_UNVERIFIED", reason: "真实迁移/浏览器验证属环境门，未执行" },
  ],
  decisionGates: "见 decisions-and-release-gates.md（未新增已批准项）",
}, null, 1));

console.log("manifest/tests/handoff written");
