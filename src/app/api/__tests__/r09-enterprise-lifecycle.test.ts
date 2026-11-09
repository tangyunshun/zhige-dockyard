import { describe, it, expect } from "vitest";
import {
  computeEnterpriseExpiryEffect,
  canAutoTransferToPersonalOnExpiry,
  validateEnterpriseDeletion,
  authorizeWorkspaceAccess,
  type EnterpriseMember,
} from "@/lib/tenant/enterprise-lifecycle";

describe("P09 企业到期与生命周期", () => {
  it("企业到期：成员进入只读/受限，且不自动转个人", () => {
    const members: EnterpriseMember[] = [
      { userId: "u1", enterpriseId: "e1", role: "MEMBER", joinedAt: 1, expiresAt: 1000 },
      { userId: "u2", enterpriseId: "e1", role: "MEMBER", joinedAt: 1, expiresAt: null },
    ];
    const eff = computeEnterpriseExpiryEffect(members, 2000);
    expect(eff.get("u1")).toBe("EXPIRED_READONLY");
    expect(eff.get("u2")).toBe("ACTIVE");
    expect(canAutoTransferToPersonalOnExpiry()).toBe(false); // 绝不自动转个人
  });

  it("企业删除合规：检测孤儿账号与跨企业影子权限，不自动清/迁移", () => {
    const check = validateEnterpriseDeletion({
      members: [
        { userId: "u1", enterpriseId: "e1", role: "MEMBER", joinedAt: 1, expiresAt: null },
        { userId: "u2", enterpriseId: "e1", role: "MEMBER", joinedAt: 1, expiresAt: null },
      ],
      userAccounts: [
        { userId: "u1", hasOtherWorkspace: false }, // 孤儿
        { userId: "u2", hasOtherWorkspace: true },
      ],
      crossEnterprisePerms: [{ userId: "u2", fromEnterprise: "e1", toEnterprise: "e2" }],
    });
    expect(check.orphanAccounts).toContain("u1");
    expect(check.crossEnterpriseShadowPerms).toContain("u2");
    expect(check.safeToDelete).toBe(false);
    expect(check.violations.length).toBe(2);
  });

  it("企业删除干净：无违规可删", () => {
    const check = validateEnterpriseDeletion({
      members: [{ userId: "u1", enterpriseId: "e1", role: "MEMBER", joinedAt: 1, expiresAt: null }],
      userAccounts: [{ userId: "u1", hasOtherWorkspace: true }],
      crossEnterprisePerms: [],
    });
    expect(check.safeToDelete).toBe(true);
    expect(check.orphanAccounts).toHaveLength(0);
  });
});

describe("P09 CF-F08 个人/企业边界", () => {
  it("成员可访问自己所在工作空间", () => {
    const r = authorizeWorkspaceAccess({
      userId: "u1",
      targetWorkspaceId: "ws1",
      userMemberships: [{ workspaceId: "ws1", role: "MEMBER" }],
      isPlatformAdmin: false,
    });
    expect(r.allowed).toBe(true);
  });

  it("非成员跨空间/跨企业访问被拒绝", () => {
    const r = authorizeWorkspaceAccess({
      userId: "u1",
      targetWorkspaceId: "ws2",
      userMemberships: [{ workspaceId: "ws1", role: "MEMBER" }],
      isPlatformAdmin: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("CF-F08");
  });

  it("平台管理员越权治理不在此边界内", () => {
    const r = authorizeWorkspaceAccess({
      userId: "admin",
      targetWorkspaceId: "wsX",
      userMemberships: [],
      isPlatformAdmin: true,
    });
    expect(r.allowed).toBe(true);
  });
});
