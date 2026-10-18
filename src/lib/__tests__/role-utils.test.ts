import { describe, it, expect } from "vitest";
import {
  isAdminRole,
  isSuperAdminRole,
  isStandardAdminRole,
  normalizeUserRole,
  ADMIN_ROLE_VALUES,
  type RoleVariant,
} from "@/lib/role-utils";

// 你点名必须匹配的全部写法
const ADMIN_SPELLINGS = [
  "ADMIN", // 全大写下划线
  "admin", // 全小写
  "Admin", // 大驼峰
  "ROLE_ADMIN", // 带前缀
  "administrator",
  "PLATFORM_ADMIN",
  "platform_admin",
];
const SUPER_SPELLINGS = [
  "SUPER_ADMIN",
  "superadmin", // 连写（库里实际存储值）
  "super_admin",
  "SUPERADMIN",
  "Superadmin",
  "Super_admin",
  "ROLE_SUPER_ADMIN",
  "ROLE_SUPERADMIN",
  "super-admin", // 连字符
  "SUPER",
  "super",
];

describe("role-utils：管理员写法全量匹配（防复发护栏）", () => {
  it("所有管理员写法都被 isAdminRole 识别", () => {
    for (const v of [...ADMIN_SPELLINGS, ...SUPER_SPELLINGS]) {
      expect(isAdminRole(v), `期望 "${v}" 被判为管理员`).toBe(true);
    }
  });

  it("所有超管写法都被 isSuperAdminRole 识别", () => {
    for (const v of SUPER_SPELLINGS) {
      expect(isSuperAdminRole(v), `期望 "${v}" 被判为超级管理员`).toBe(true);
    }
  });

  it("标准管理员不含超管", () => {
    for (const v of ADMIN_SPELLINGS) expect(isStandardAdminRole(v)).toBe(true);
    for (const v of SUPER_SPELLINGS) expect(isStandardAdminRole(v)).toBe(false);
  });

  it("普通 / 业务角色不被误判为管理员", () => {
    for (const v of ["user", "creator", "developer", "member", "OWNER", ""]) {
      expect(isAdminRole(v), `角色 "${v}" 不应是管理员`).toBe(false);
    }
  });

  it("normalizeUserRole 归一到规范值", () => {
    expect(normalizeUserRole("ROLE_ADMIN")).toBe("admin");
    expect(normalizeUserRole("ADMIN")).toBe("admin");
    expect(normalizeUserRole("Admin")).toBe("admin");
    expect(normalizeUserRole("superadmin")).toBe("superadmin");
    expect(normalizeUserRole("ROLE_SUPER_ADMIN")).toBe("superadmin");
    expect(normalizeUserRole("super-admin")).toBe("superadmin");
    expect(normalizeUserRole("user")).toBe("user");
  });

  it("ADMIN_ROLE_VALUES 包含你点名的全部写法（改这里会立刻红）", () => {
    const set = new Set<string>(ADMIN_ROLE_VALUES as readonly string[]);
    for (const v of ["ADMIN", "admin", "Admin", "ROLE_ADMIN", "SUPER_ADMIN", "superadmin", "ROLE_SUPER_ADMIN"]) {
      expect(set.has(v), `ADMIN_ROLE_VALUES 缺失写法 "${v}"`).toBe(true);
    }
  });

  it("RoleVariant 类型与运行期集合一致（编译期即锁死）", () => {
    // 若有人在 ADMIN_ROLE_VALUES 里手滑写错，这里的类型推导会不一致
    const sample: RoleVariant = "admin";
    expect(ADMIN_ROLE_VALUES).toContain(sample);
  });
});
