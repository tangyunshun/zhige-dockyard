import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

/**
 * 审计动作字典「穷举覆盖」守护测试（KN-CFG 重构版）。
 *
 * 字典唯一真相源 = 数据库 system_config（audit_action_dict / audit_resource_dict），
 * 代码不再内置任何默认映射（用户红线：配置不允许硬编码）。
 *
 * 机制目标：系统里已经存在的每一个 writeAuditLog 动作键，都必须在数据库字典中有对应中文词条，
 * 杜绝任何英文裸显；未来新增动作若忘记在库内登记词条，本测试会直接失败。
 *
 * 实现：静态扫描 src 下所有源码提取 writeAuditLog 动作键，再与数据库字典比对断言：
 *   1) 每个动作键都已登记；
 *   2) 登记值非空且包含中文字符（防止登记了空串/英文）。
 */

dotenv.config();
const prisma = new PrismaClient();

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
let actionDict: Record<string, string> = {};
let resourceDict: Record<string, string> = {};

beforeAll(async () => {
  const rec = await prisma.systemconfig.findUnique({ where: { key: "audit_action_dict" } });
  actionDict = rec?.value ? JSON.parse(rec.value) : {};
  const resRec = await prisma.systemconfig.findUnique({ where: { key: "audit_resource_dict" } });
  resourceDict = resRec?.value ? JSON.parse(resRec.value) : {};
  await prisma.$disconnect();
});

describe("审计动作字典穷举覆盖（数据库字典）", () => {
  it("全系统 writeAuditLog 动作键总数应大于 0（扫描器正常工作）", () => {
    expect(actionKeys.size).toBeGreaterThan(0);
  });

  it("数据库 audit_action_dict 必须已初始化且词条数充足", () => {
    expect(
      Object.keys(actionDict).length,
      "audit_action_dict 未初始化或为空——请确认 system_config 中已录入审计动作字典",
    ).toBeGreaterThan(50);
  });

  it("每个已存在的审计动作键都必须在数据库字典中登记且为中文", () => {
    const missing: string[] = [];
    const badValue: string[] = [];
    for (const key of actionKeys) {
      if (!(key in actionDict)) {
        missing.push(key);
        continue;
      }
      const label = actionDict[key] || "";
      if (!label.trim() || !/[一-龥]/.test(label)) {
        badValue.push(`${key} => "${label}"`);
      }
    }
    expect(missing, `以下动作键未在数据库 audit_action_dict 登记中文词条（请在 system_config 库内补充）：\n${missing.join("\n")}`).toEqual([]);
    expect(badValue, `以下词条值为空或非中文，请修正：\n${badValue.join("\n")}`).toEqual([]);
  });

  it("每个动作键的模块前缀都必须在数据库资源字典中登记且为中文（资源列翻译兜底）", () => {
    // writeAuditLog 落库时 resource = action.split(":")[0]，因此模块前缀必须可译，否则资源列裸英文
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
    expect(missing, `以下模块前缀未在数据库 audit_resource_dict 登记中文资源名（资源列会裸英文），请在 system_config 库内补充：\n${missing.join("\n")}`).toEqual([]);
    expect(badValue, `以下资源词条值为空或非中文，请修正：\n${badValue.join("\n")}`).toEqual([]);
  });
});
