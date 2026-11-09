import { describe, it, expect } from "vitest";
import {
  computeHomepageState,
  preserveLoginIntent,
  computePreTaskDisclosure,
  computeTaskProgressView,
  computeResultView,
  decideReuseOrNew,
  checkWorkspaceEntry,
  type CapabilityCard,
} from "@/lib/journey/first-value-journey";
import type { AttemptOutcome } from "@/lib/billing/execution-orchestration";

const CAP_READY: CapabilityCard = { id: "cap1", name: "智能效能分析引擎", produces: "结构化效能报告", ready: true, isExample: false };
const CAP_NOT_READY: CapabilityCard = { id: "cap2", name: "合同风险扫描", produces: "风险清单", ready: false, isExample: false, notReadyReason: "合同能力尚未就绪" };
const CAP_EXAMPLE: CapabilityCard = { id: "ex1", name: "示例：简历解析", produces: "解析示例", ready: true, isExample: true };

describe("P10 首页到首次成果/复用/费用说明", () => {
  describe("1) 首页：给谁/解决什么/产出什么，诚实就绪", () => {
    it("未就绪能力诚实标记，不承诺", () => {
      const hp = computeHomepageState("企业知识团队", "把资料变成可复用成果", [CAP_READY, CAP_NOT_READY]);
      expect(hp.capabilities.find((c) => c.id === "cap2")!.ready).toBe(false);
      expect(hp.capabilities.find((c) => c.id === "cap2")!.notReadyReason).toBe("合同能力尚未就绪");
    });
    it("示例永久标示示例，不冒充真实分析", () => {
      const hp = computeHomepageState("团队", "x", [CAP_EXAMPLE]);
      expect(hp.capabilities[0].isExample).toBe(true);
      expect(hp.primaryAction.label).toBe("查看示例");
    });
    it("有不写死 C 编号的展示名称", () => {
      const hp = computeHomepageState("团队", "x", [CAP_READY]);
      expect(hp.capabilities[0].name).toBe("智能效能分析引擎");
      expect(/C\d+/.test(hp.capabilities[0].name)).toBe(false);
    });
  });

  describe("2) 登录/注册保留安全意图，防开放跳转", () => {
    it("站内相对路径保留意图", () => {
      expect(preserveLoginIntent("/workspaces/ws1?tab=studio", ["app.example.com"])).toBe("/workspaces/ws1?tab=studio");
    });
    it("开放跳转/协议相对被回落首页", () => {
      expect(preserveLoginIntent("https://evil.com/steal", ["app.example.com"])).toBe("/workspaces");
      expect(preserveLoginIntent("//evil.com", ["app.example.com"])).toBe("/workspaces");
    });
    it("空意图回落默认空间入口", () => {
      expect(preserveLoginIntent(undefined, ["app.example.com"])).toBe("/workspaces");
    });
  });

  describe("3) 任务前集中披露：材料/付款方/费用/授权上限，报价过期重确认", () => {
    it("未上传文件不称已保存，提示先上传", () => {
      const d = computePreTaskDisclosure({ materialScope: "CSV", resultScope: "报告", recipient: "ws1", payer: "个人", feeNature: "FIXED", authCapPoints: 5, quoteReady: true, quoteExpired: false, fileUploaded: false });
      expect(d.warnings.some((w) => w.includes("尚未上传文件"))).toBe(true);
      expect(d.canSubmit).toBe(false);
    });
    it("报价过期必须重新确认，不能提交", () => {
      const d = computePreTaskDisclosure({ materialScope: "CSV", resultScope: "报告", recipient: "ws1", payer: "个人", feeNature: "FIXED", authCapPoints: 5, quoteReady: true, quoteExpired: true, fileUploaded: true });
      expect(d.reconfirmRequired).toBe(true);
      expect(d.canSubmit).toBe(false);
    });
    it("预算不足（报价未就绪/授权上限 0）阻断提交", () => {
      const d = computePreTaskDisclosure({ materialScope: "CSV", resultScope: "报告", recipient: "ws1", payer: "个人", feeNature: "ESTIMATE", authCapPoints: 0, quoteReady: false, quoteExpired: false, fileUploaded: true });
      expect(d.quoteReady).toBe(false);
      expect(d.canSubmit).toBe(false);
    });
    it("材料/接收者/付款方/授权上限均披露", () => {
      const d = computePreTaskDisclosure({ materialScope: "CSV", resultScope: "报告", recipient: "空间A", payer: "企业B", feeNature: "FREE", authCapPoints: 0, quoteReady: true, quoteExpired: false, fileUploaded: true });
      expect(d.canSubmit).toBe(true);
      expect(d.payer).toBe("企业B");
      expect(d.feeNature).toBe("FREE");
    });
  });

  describe("4) 任务进度诚实：未知/失败/无成果绝不显示成功", () => {
    it("unknown 如实展示，不伪装成功、提示勿重复提交", () => {
      const v = computeTaskProgressView("RUNNING", "UNKNOWN" as AttemptOutcome, false);
      expect(v.shownAsSuccess).toBe(false);
      expect(v.status).toBe("UNKNOWN");
      expect(v.message).toContain("未知");
    });
    it("失败不显示成功", () => {
      const v = computeTaskProgressView("FAILED", "FAILED" as AttemptOutcome, false);
      expect(v.shownAsSuccess).toBe(false);
    });
    it("结束但无有效成果不算成功", () => {
      const v = computeTaskProgressView("DONE", "SUCCESS" as AttemptOutcome, false);
      expect(v.shownAsSuccess).toBe(false);
      expect(v.status).toBe("NO_RESULT");
    });
    it("仅真实成功且有有效成果才显示成功", () => {
      const v = computeTaskProgressView("DONE", "SUCCESS" as AttemptOutcome, true);
      expect(v.shownAsSuccess).toBe(true);
      expect(v.status).toBe("SUCCESS");
    });
    it("被拒绝不产生费用，提示检查", () => {
      const v = computeTaskProgressView("PENDING", "REJECTED" as AttemptOutcome, false);
      expect(v.status).toBe("NO_RESULT");
      expect(v.message).toContain("未产生费用");
    });
  });

  describe("5) 成果视图：查看/下载/历史复用零新费用/零新模型调用", () => {
    it("查看下载不产生新调用/新费用", () => {
      const r = computeResultView({ contentSummary: "报告", source: "ws1/run1", needsReview: true, version: "1.0.0", feeBasis: "FIXED" });
      expect(r.newCallOnView).toBe(false);
      expect(r.newFeeOnView).toBe(false);
      expect(r.needsReview).toBe(true);
    });
  });

  describe("6) 复用 vs 新执行：跨企业缓存复用禁止", () => {
    it("跨企业禁止复用，需新执行授权费用", () => {
      const d = decideReuseOrNew({ hasExistingResult: true, sameWorkspace: true, sameEnterprise: false, materialChanged: false, quoteStillValid: true });
      expect(d.reuse).toBe(false);
      expect(d.requireNewExecution).toBe(true);
      expect(d.reason).toContain("跨企业");
    });
    it("同企业/空间/材料/报价未变可复用零新费用", () => {
      const d = decideReuseOrNew({ hasExistingResult: true, sameWorkspace: true, sameEnterprise: true, materialChanged: false, quoteStillValid: true });
      expect(d.reuse).toBe(true);
      expect(d.requireNewExecution).toBe(false);
    });
    it("材料变/报价过期需新执行", () => {
      const d = decideReuseOrNew({ hasExistingResult: true, sameWorkspace: true, sameEnterprise: true, materialChanged: true, quoteStillValid: true });
      expect(d.reuse).toBe(false);
      expect(d.requireNewExecution).toBe(true);
    });
  });

  describe("7) 空间入口复用 CF-F08 边界（非成员拒绝）", () => {
    it("成员可进入自己空间", () => {
      const r = checkWorkspaceEntry({ userId: "u1", targetWorkspaceId: "ws1", userMemberships: [{ workspaceId: "ws1", role: "MEMBER" }], isPlatformAdmin: false });
      expect(r.allowed).toBe(true);
    });
    it("非成员跨空间被拒", () => {
      const r = checkWorkspaceEntry({ userId: "u1", targetWorkspaceId: "ws2", userMemberships: [{ workspaceId: "ws1", role: "MEMBER" }], isPlatformAdmin: false });
      expect(r.allowed).toBe(false);
    });
  });
});
