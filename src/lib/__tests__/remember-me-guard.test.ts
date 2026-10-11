import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * 「7 天内免登录」修复验证（核心根因）：
 * refresh 每次静默刷新都更换 sessionToken（会话令牌），导致：
 *   1) 多标签页互相挤线踢登出；
 *   2) 关浏览器时刷新进行到一半（库已写新值、响应未送达）→ 下次打开必被踢。
 * 修复后：refresh 保留原 sessionToken，只有真正的新登录才轮换会话令牌。
 *
 * 由于 refresh 路由逻辑内联在 route.ts，这里以源代码断言方式锁定关键行为，
 * 防止回归（架构守卫模式，与 model-architecture.test.ts 同款）。
 */
import fs from "fs";
import path from "path";

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../../app/api/auth/refresh/route.ts"),
  "utf8",
);

describe("refresh 会话令牌守卫（7 天免登录修复）", () => {
  it("refresh 不得生成新 sessionToken：必须沿用请求用户已有的会话令牌", () => {
    // 修复前：const sessionToken = crypto.randomUUID(); —— 每次刷新换新会话
    expect(routeSource).not.toMatch(/const sessionToken = crypto\.randomUUID\(\)/);
    // 修复后：沿用库中原会话令牌
    expect(routeSource).toMatch(/const sessionToken = user\.sessionToken/);
  });

  it("refresh 仍保留 RT 轮换（防重放语义不得被顺手删除）", () => {
    expect(routeSource).toMatch(/const newRefreshToken = crypto\.randomUUID\(\)/);
    expect(routeSource).toMatch(/refreshTokenPrev/);
  });

  it("refresh 仍保留「记住我」长会话判定（sessionRememberMe 显式标记）", () => {
    expect(routeSource).toMatch(/user\.sessionRememberMe === true/);
  });

  it("挤线校验保留：validateUser 的 MULTI_LOGIN_CONFLICT 不得被移除", () => {
    const authSource = fs.readFileSync(
      path.resolve(__dirname, "../../lib/auth.ts"),
      "utf8",
    );
    expect(authSource).toMatch(/MULTI_LOGIN_CONFLICT/);
  });

  it("login 路由保留 sessionRememberMe 写入（登录勾选落库）", () => {
    const loginSource = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/auth/login/route.ts"),
      "utf8",
    );
    expect(loginSource).toMatch(/sessionRememberMe: rememberMe === true/);
  });
});
