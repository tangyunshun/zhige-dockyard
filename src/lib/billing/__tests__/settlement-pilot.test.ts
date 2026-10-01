import { describe, it, expect } from "vitest";
import {
  parseComponentWhitelist,
  isComponentSettlementEnabled,
} from "../billing-config";
import {
  computeDepositTokenBounds,
  DEPOSIT_MAX_INPUT_TOKENS,
  DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS,
  computeEstimatedPoints,
} from "../pricing-center";

/**
 * 批次 2 押金-结算试点：白名单灰度开关与押金用量上界的确定性测试。
 * 全部纯函数，不连数据库、不调用模型。
 */

describe("parseComponentWhitelist", () => {
  it("合法 JSON 数组：解析并去重、trim、统一大写", () => {
    expect(parseComponentWhitelist('["C01","c07","C01"]')).toEqual(["C01", "C07"]);
  });

  it("空串 / null / undefined → 空数组", () => {
    expect(parseComponentWhitelist("")).toEqual([]);
    expect(parseComponentWhitelist(null)).toEqual([]);
    expect(parseComponentWhitelist(undefined)).toEqual([]);
  });

  it("非法 JSON / 非数组 / 含非字符串元素 → 空数组（绝不猜测）", () => {
    expect(parseComponentWhitelist("not-json")).toEqual([]);
    expect(parseComponentWhitelist('{"C01":true}')).toEqual([]);
    expect(parseComponentWhitelist('["C01",123,null]')).toEqual(["C01"]);
  });
});

describe("isComponentSettlementEnabled（灰度分流）", () => {
  const opts = { whitelist: ["C01", "C07"] };

  it("全局 flag 关闭 → 一律 false（即使组件在白名单）", () => {
    expect(isComponentSettlementEnabled("C01", { globalFlag: false, whitelist: opts.whitelist })).toBe(false);
  });

  it("全局 flag 开启：白名单内 true，白名单外 false", () => {
    expect(isComponentSettlementEnabled("C01", { globalFlag: true, whitelist: opts.whitelist })).toBe(true);
    expect(isComponentSettlementEnabled("C07", { globalFlag: true, whitelist: opts.whitelist })).toBe(true);
    // C02 等白名单外组件维持估算兼容模式
    expect(isComponentSettlementEnabled("C02", { globalFlag: true, whitelist: opts.whitelist })).toBe(false);
  });

  it("空白名单 → 全部 false（全局开启也不一刀切）", () => {
    expect(isComponentSettlementEnabled("C01", { globalFlag: true, whitelist: [] })).toBe(false);
  });

  it("大小写不敏感（组件 id 统一大写比较）", () => {
    expect(isComponentSettlementEnabled("c01", { globalFlag: true, whitelist: ["C01"] })).toBe(true);
  });
});

describe("computeDepositTokenBounds（押金最坏情况上界）", () => {
  it("0 字符材料：输入 0，输出取合同值", () => {
    expect(computeDepositTokenBounds(0, 2200)).toEqual({ inputTokens: 0, outputTokens: 2200 });
  });

  it("普通材料：输入 = ceil(字符数 ÷ 2)", () => {
    expect(computeDepositTokenBounds(1000, 2200)).toEqual({ inputTokens: 500, outputTokens: 2200 });
  });

  it("超长材料：输入截断至 DEPOSIT_MAX_INPUT_TOKENS（4000），押金不虚高", () => {
    const r = computeDepositTokenBounds(999_999, 4096);
    expect(r.inputTokens).toBe(DEPOSIT_MAX_INPUT_TOKENS);
    expect(r.inputTokens).toBe(4000);
  });

  it("合同未声明 maxOutputTokens：回退默认 4096", () => {
    expect(computeDepositTokenBounds(100, null)).toEqual({
      inputTokens: 50,
      outputTokens: DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS,
    });
    expect(computeDepositTokenBounds(100, 0)).toEqual({
      inputTokens: 50,
      outputTokens: DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS,
    });
    expect(computeDepositTokenBounds(100, -5)).toEqual({
      inputTokens: 50,
      outputTokens: DEPOSIT_DEFAULT_MAX_OUTPUT_TOKENS,
    });
  });

  it("校准输入均值作为下限：材料短时押金按校准值收（试点缺陷修复：估算 600 vs 真实 4788）", () => {
    // 材料字符 1200 → raw 600 < 校准 1325（C07）→ 取校准值
    expect(computeDepositTokenBounds(1200, 4096, 1325)).toEqual({ inputTokens: 1325, outputTokens: 4096 });
    // 材料长：raw 6000 > 校准 → 取 raw，cap=max(4000, 校准)=4000 → 4000
    expect(computeDepositTokenBounds(12_000, 4096, 1325)).toEqual({ inputTokens: 4000, outputTokens: 4096 });
  });

  it("校准值超过 4000：上限随之放宽，校准下限不被硬顶砍掉（否则补扣问题回归）", () => {
    expect(computeDepositTokenBounds(100, 4096, 6000)).toEqual({ inputTokens: 6000, outputTokens: 4096 });
  });

  it("无校准 / 非法校准：退回字符估算行为", () => {
    expect(computeDepositTokenBounds(1000, 2200, null)).toEqual({ inputTokens: 500, outputTokens: 2200 });
    expect(computeDepositTokenBounds(1000, 2200, 0)).toEqual({ inputTokens: 500, outputTokens: 2200 });
    expect(computeDepositTokenBounds(1000, 2200, -3)).toEqual({ inputTokens: 500, outputTokens: 2200 });
  });
});

describe("押金换算端到端（C07 最坏情况，deepseek-flash 高峰价 2/8 元每百万，k=2.0，保底 5）", () => {
  // 单价（微元/百万）：输入 2 元 = 2_000_000 微元；输出 8 元 = 8_000_000 微元
  const UNIT = { input: 2_000_000, output: 8_000_000 };

  it("C07 最坏情况（材料 12000 字符 → 4000 Token 输入 + 4096 输出）= 9 点（含向上取整与保底）", () => {
    // 成本 = 4000×2/1e6 + 4096×8/1e6 = 0.008 + 0.032768 = 0.040768 元；×k2.0 = 0.081536 元 = 8.1536 点 → ceil 9
    const bounds = computeDepositTokenBounds(12_000, 4096);
    expect(bounds).toEqual({ inputTokens: 4000, outputTokens: 4096 });
    const est = computeEstimatedPoints({
      deploymentId: "dep_deepseek",
      unit: UNIT,
      inputTokens: bounds.inputTokens,
      outputTokens: bounds.outputTokens,
      pricingSource: "PLATFORM",
      priceKind: "COST_PLUS_MARKUP",
      markupCoefficientBps: 20_000, // k = 2.0
      byokServiceRateBps: 1_500,
      minPointsPerTask: 5,
    } as any);
    expect(est.basis).toBe("CONVERTED_PRICE");
    expect(est.points).toBe(9);
    // applied 语义 = 本次计算应用的保底配置值（9 > 5 未抬升，仍记录配置值 5）
    expect(est.snapshot.minPointsPerTaskApplied).toBe(5);
  });

  it("短材料小额执行触发保底：换算 1 点 → 计费 5 点", () => {
    const est = computeEstimatedPoints({
      deploymentId: "dep_deepseek",
      unit: UNIT,
      inputTokens: 100,
      outputTokens: 100,
      pricingSource: "PLATFORM",
      priceKind: "COST_PLUS_MARKUP",
      markupCoefficientBps: 20_000,
      byokServiceRateBps: 1_500,
      minPointsPerTask: 5,
    } as any);
    // 100×2/1e6 + 100×8/1e6 = 0.001 元 ×2 = 0.002 元 = 0.2 点 → ceil 1 → 保底 max(1,5) = 5
    expect(est.points).toBe(5);
    expect(est.snapshot.minPointsPerTaskApplied).toBe(5);
  });
});
