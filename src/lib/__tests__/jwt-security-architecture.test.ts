import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  getJwtSecretKey,
  getJwtSecretString,
  setExplicitTestJwtSecret,
  JwtConfigurationError,
} from "@/lib/jwt-config";

describe("JWT 安全架构守护与配置规范测试", () => {
  describe("生产代码静态安全守卫 (Static Architectural Guard)", () => {
    const srcDir = path.resolve(__dirname, "../..");

    function getAllSourceFiles(dir: string, fileList: string[] = []): string[] {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          // 跳过测试目录与临时目录
          if (item === "__tests__" || item === "node_modules" || item === ".next") {
            continue;
          }
          getAllSourceFiles(fullPath, fileList);
        } else if (stat.isFile() && (item.endsWith(".ts") || item.endsWith(".tsx") || item.endsWith(".js"))) {
          fileList.push(fullPath);
        }
      }
      return fileList;
    }

    const files = getAllSourceFiles(srcDir);

    test("所有生产源文件中严禁出现弱硬编码默认密钥 your-secret-key-change-in-production", () => {
      const violations: string[] = [];
      for (const file of files) {
        if (file.endsWith("jwt-config.ts")) continue; // 排除定义安全规则的规范文件本身
        const content = fs.readFileSync(file, "utf8");
        if (content.includes("your-secret-key-change-in-production")) {
          violations.push(file);
        }
      }
      assert.deepEqual(violations, [], `发现违规使用弱默认密钥的文件: ${violations.join(", ")}`);
    });

    test("所有生产源文件中严禁对 JWT_SECRET 使用内联降级兜底 || 语法", () => {
      const violations: string[] = [];
      const inlineFallbackRegex = /process\.env\.JWT_SECRET\s*\|\|/;
      for (const file of files) {
        if (file.endsWith("jwt-config.ts")) continue;
        const content = fs.readFileSync(file, "utf8");
        if (inlineFallbackRegex.test(content)) {
          violations.push(file);
        }
      }
      assert.deepEqual(violations, [], `发现违规内联兜底 JWT_SECRET 的文件: ${violations.join(", ")}`);
    });
  });

  describe("jwt-config 运行时边界测试 (Runtime Enforcement)", () => {
    const originalSecret = process.env.JWT_SECRET;

    test("当 JWT_SECRET 环境变量未配置且无显式测试注入时必须硬失败抛出 MISSING_JWT_SECRET", () => {
      setExplicitTestJwtSecret(null);
      delete process.env.JWT_SECRET;

      assert.throws(
        () => {
          getJwtSecretString();
        },
        (err: unknown) => {
          assert.ok(err instanceof JwtConfigurationError);
          assert.equal(err.code, "MISSING_JWT_SECRET");
          return true;
        }
      );

      assert.throws(
        () => {
          getJwtSecretKey();
        },
        (err: unknown) => {
          assert.ok(err instanceof JwtConfigurationError);
          assert.equal(err.code, "MISSING_JWT_SECRET");
          return true;
        }
      );
    });

    test("当 JWT_SECRET 长度低于 32 字符时必须硬失败抛出 INSECURE_JWT_SECRET", () => {
      setExplicitTestJwtSecret(null);
      process.env.JWT_SECRET = "too-short-key";

      assert.throws(
        () => {
          getJwtSecretString();
        },
        (err: unknown) => {
          assert.ok(err instanceof JwtConfigurationError);
          assert.equal(err.code, "INSECURE_JWT_SECRET");
          return true;
        }
      );
    });

    test("合法的 JWT_SECRET (>= 32 字符) 必须正确解析并返回 Uint8Array 密钥", () => {
      setExplicitTestJwtSecret(null);
      const validSecret = "secure-production-secret-token-key-must-be-32-chars-long";
      process.env.JWT_SECRET = validSecret;

      const secretStr = getJwtSecretString();
      assert.equal(secretStr, validSecret);

      const key = getJwtSecretKey();
      assert.ok(key instanceof Uint8Array);
      assert.equal(Buffer.from(key).toString("utf8"), validSecret);
    });

    test("显式注入测试密钥 (setExplicitTestJwtSecret) 优先级高于环境变量且支持恢复", () => {
      process.env.JWT_SECRET = "env-secret-key-at-least-32-chars-abcdef";
      const testSecret = "test-injected-secret-key-at-least-32-chars-xyz";

      setExplicitTestJwtSecret(testSecret);
      assert.equal(getJwtSecretString(), testSecret);

      setExplicitTestJwtSecret(null);
      assert.equal(getJwtSecretString(), process.env.JWT_SECRET);

      // 恢复原环境
      if (originalSecret) {
        process.env.JWT_SECRET = originalSecret;
      }
    });
  });
});
