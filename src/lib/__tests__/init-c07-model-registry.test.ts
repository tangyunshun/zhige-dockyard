import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveC07BaseUrl,
  sanitizeEndpointForDisplay,
  formatSecretConfiguredStatus,
} from "../../../scripts/cli-env";

describe("C07 初始化与 CLI 环境安全加载规范", () => {
  test("缺失端点时必须硬失败（C07_BASE_URL_REQUIRED），绝不得默认降级至 OpenAI", () => {
    // 模拟既没有 C07_PROVIDER_BASE_URL 也没有 MODEL_BASE_URL 的环境
    const mockEnv: Record<string, string | undefined> = {
      C07_PROVIDER_BASE_URL: "",
      MODEL_BASE_URL: undefined,
    };

    const res = resolveC07BaseUrl(mockEnv);
    assert.equal(res.success, false, "缺少 Base URL 时决策必须判定为失败");
    assert.ok(
      res.error && res.error.includes("C07_BASE_URL_REQUIRED"),
      "必须明确报告 C07_BASE_URL_REQUIRED 错误"
    );
    assert.equal(res.baseUrl, undefined, "不得生成任何 baseUrl");
    // 严格禁止隐式写出 openai.com
    assert.ok(
      !(res.baseUrl || "").includes("openai.com"),
      "严格禁止隐式降级至 OpenAI 默认端点"
    );
  });

  test("提供 MODEL_BASE_URL 时必须能够正确提取真实端点", () => {
    const mockEnv: Record<string, string | undefined> = {
      MODEL_BASE_URL: "https://proxy.custom-domain.com/v1",
    };

    const res = resolveC07BaseUrl(mockEnv);
    assert.equal(res.success, true);
    assert.equal(res.baseUrl, "https://proxy.custom-domain.com/v1");
  });

  test("提供 C07_PROVIDER_BASE_URL 时优先级高于通用 MODEL_BASE_URL", () => {
    const mockEnv: Record<string, string | undefined> = {
      C07_PROVIDER_BASE_URL: "https://c07.special-endpoint.com/v1",
      MODEL_BASE_URL: "https://general.endpoint.com/v1",
    };

    const res = resolveC07BaseUrl(mockEnv);
    assert.equal(res.success, true);
    assert.equal(res.baseUrl, "https://c07.special-endpoint.com/v1");
  });

  test("端点展示脱敏：仅打印协议与主机名，隐藏具体路由和敏感路径", () => {
    const fullUrl = "https://api.magicai.internal:8443/v1/chat/completions?secret_token=abc";
    const safe = sanitizeEndpointForDisplay(fullUrl);
    assert.equal(safe, "https://api.magicai.internal:8443");
    assert.ok(!safe.includes("secret_token"), "脱敏端点严禁泄露查询参数");
    assert.ok(!safe.includes("/chat/completions"), "脱敏端点不打印子路径");
  });

  test("密钥展示脱敏：绝不输出明文密钥", () => {
    const secretKey = "sk-super-secret-production-key-999999999999";
    const statusWithKey = formatSecretConfiguredStatus(secretKey);
    assert.ok(
      !statusWithKey.includes("sk-super-secret"),
      "脱敏展示严禁包含任何密钥明文片段"
    );
    assert.ok(statusWithKey.includes("已配置"), "必须正确反馈已配置状态");

    const statusEmpty = formatSecretConfiguredStatus(undefined);
    assert.ok(statusEmpty.includes("未配置"), "未配置时清晰反馈");
  });

  describe("运维一致性与入口审查", () => {
    test("package.json 中必须注册 init:model-registry 命令且指向正确脚本", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const pkgPath = path.resolve(__dirname, "../../../package.json");
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

      assert.ok(pkg.scripts, "package.json 必须包含 scripts");
      assert.ok(pkg.scripts["init:model-registry"], "必须配置 init:model-registry 命令");
      assert.ok(
        pkg.scripts["init:model-registry"].includes("scripts/init-c07-model-registry.ts"),
        "init:model-registry 命令必须指向 scripts/init-c07-model-registry.ts"
      );
    });

    test("scripts/init-c07-model-registry.ts 中绝无 openai.com 默认回落过期注释", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const scriptPath = path.resolve(__dirname, "../../../scripts/init-c07-model-registry.ts");
      const code = fs.readFileSync(scriptPath, "utf8");

      assert.ok(
        !code.includes("https://api.openai.com/v1"),
        "严格禁止包含指向 openai.com 的默认回落描述"
      );
      assert.ok(
        !code.includes("缺省 https://api.openai.com"),
        "严格禁止包含缺省 openai 注释"
      );
      assert.ok(
        code.includes("C07_BASE_URL_REQUIRED"),
        "注释或代码必须明确指示 C07_BASE_URL_REQUIRED"
      );
    });

    test("--help 命令行参数必须在子进程中快速纯净退出（exitCode=0 且无数据库连接）", async () => {
      const { spawnSync } = await import("node:child_process");
      const path = await import("node:path");
      const scriptPath = path.resolve(__dirname, "../../../scripts/init-c07-model-registry.ts");

      const proc = spawnSync(
        process.execPath,
        ["--import", "tsx", scriptPath, "--help"],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            // 故意移除 DATABASE_URL，若尝试建立 Prisma 连接则会报错
            DATABASE_URL: undefined,
          },
          timeout: 5000,
        }
      );

      assert.equal(proc.status, 0, "帮助命令必须以 0 成功退出");
      assert.ok(
        proc.stdout.includes("C07 模型注册表初始化工具"),
        "输出必须包含帮助用法文案"
      );
      assert.ok(
        !proc.stdout.includes("已配置"),
        "帮助模式不得执行任何密钥状态检测输出"
      );
      assert.ok(
        !proc.stderr || proc.stderr.trim() === "",
        "帮助模式不得产生任何错误输出"
      );
    });
  });
});

