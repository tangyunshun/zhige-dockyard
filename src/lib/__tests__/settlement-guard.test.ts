/**
 * 真实 Token 结算「防静默开启」守护
 *
 * 约束：本轮及后续均不得开启真实 Token 结算（settlementEnabled 必须恒为 false）。
 * 本文件锁定该约束，防止任何环境变量或显式参数在生产环境把它打开。
 *
 * 不读取、不打印 .env / .env.local 内容，仅断言运行时行为。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { isTokenSettlementFeatureEnabled } from "@/lib/token-settlement-service";

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(patch)) prev[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

describe("真实 Token 结算防静默开启（settlementEnabled 恒为 false）", () => {
  test("生产环境硬关闭：即使测试标志为 true 且显式 override，也必须为 false", () => {
    withEnv({ NODE_ENV: "production", TEST_TOKEN_SETTLEMENT_ENABLED: "true" }, () => {
      assert.equal(isTokenSettlementFeatureEnabled(), false, "生产环境必须硬关闭");
      assert.equal(isTokenSettlementFeatureEnabled(true), false, "生产环境 explicitOverride 不得穿透");
    });
  });

  test("非生产环境未显式开启时必须为 false（默认关闭）", () => {
    withEnv({ TEST_TOKEN_SETTLEMENT_ENABLED: undefined }, () => {
      assert.equal(isTokenSettlementFeatureEnabled(), false, "未显式开启时必须默认关闭");
    });
  });

  test("当前运行环境的结算开关必须为 false", () => {
    assert.equal(isTokenSettlementFeatureEnabled(), false, "本仓库验收环境 settlementEnabled 必须为 false");
  });
});
