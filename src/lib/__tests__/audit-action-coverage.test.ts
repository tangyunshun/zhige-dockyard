import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { DEFAULT_ACTION_DICT, DEFAULT_RESOURCE_DICT } from "@/lib/audit-dict";

/**
 * 审计动作字典「穷举覆盖」守护测试。
 *
 * 机制目标：系统里已经存在的每一个 writeAuditLog 动作键，都必须有对应的中文词条，
 * 杜绝任何英文裸显；同时约束未来新增动作时若忘记登记词条，本测试会直接失败。
 *
 * 实现：静态扫描 src 下所有源码，提取 writeAuditLog 的动作键（含三元表达式两分支），
 * 再与真实导出的 DEFAULT_ACTION_DICT 比对，断言：
 *   1) 每个动作键都已登记；
 *   2) 登记值非空且包含中文字符（防止登记了空串/英文）。
 */

const SRC_ROOT = path.resolve(process.cwd(), "src");

function collectActionKeys(): Set<string> {
  const keys = new Set<string>();
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(e.name)) continue;
      const code = fs.readFileSync(p, "utf8");
      // 提取 writeAuditLog(<第一参数>, <动作表达式>, ...)
      const re = /writeAuditLog\(\s*[^,]+?,\s*([^,]+?)\s*,/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code))) {
        const sre = /"([^"]+)"/g;
        let s: RegExpExecArray | null;
        while ((s = sre.exec(m[1]))) {
          const key = s[1];
          // 只收集动作形态：含冒号，或全大写带下划线（如 UNAUTHORIZED）
          if (key.includes(":") || /^[A-Z][A-Z0-9_]*$/.test(key)) keys.add(key);
        }
      }
    }
  }
  walk(SRC_ROOT);
  return keys;
}

const actionKeys = collectActionKeys();
const dict = DEFAULT_ACTION_DICT;

describe("审计动作字典穷举覆盖", () => {
  it("全系统 writeAuditLog 动作键总数应大于 0（扫描器正常工作）", () => {
    expect(actionKeys.size).toBeGreaterThan(0);
  });

  it("每个已存在的审计动作键都必须在 DEFAULT_ACTION_DICT 中登记且为中文", () => {
    const missing: string[] = [];
    const badValue: string[] = [];
    for (const key of actionKeys) {
      if (!(key in dict)) {
        missing.push(key);
        continue;
      }
      const label = dict[key as keyof typeof dict] || "";
      if (!label.trim() || !/[一-龥]/.test(label)) {
        badValue.push(`${key} => "${label}"`);
      }
    }
    expect(missing, `以下动作键未登记中文词条，请在 audit-dict.ts 的 DEFAULT_ACTION_DICT 中补充：\n${missing.join("\n")}`).toEqual([]);
    expect(badValue, `以下词条值为空或非中文，请修正：\n${badValue.join("\n")}`).toEqual([]);
  });

  it("每个动作键的模块前缀都必须在 DEFAULT_RESOURCE_DICT 中登记且为中文（资源列翻译兜底）", () => {
    // writeAuditLog 落库时 resource = action.split(":")[0]，因此模块前缀必须可译，否则资源列裸英文
    const resourceDict = DEFAULT_RESOURCE_DICT;
    const modules = new Set<string>();
    for (const key of actionKeys) {
      if (key.includes(":")) modules.add(key.split(":")[0]);
    }
    const missing: string[] = [];
    const badValue: string[] = [];
    for (const mod of modules) {
      if (!(mod in resourceDict)) {
        missing.push(mod);
        continue;
      }
      const label = resourceDict[mod] || "";
      if (!label.trim() || !/[一-龥]/.test(label)) {
        badValue.push(`${mod} => "${label}"`);
      }
    }
    expect(missing, `以下模块前缀未在 DEFAULT_RESOURCE_DICT 登记中文资源名（资源列会裸英文），请补充：\n${missing.join("\n")}`).toEqual([]);
    expect(badValue, `以下资源词条值为空或非中文，请修正：\n${badValue.join("\n")}`).toEqual([]);
  });
});
