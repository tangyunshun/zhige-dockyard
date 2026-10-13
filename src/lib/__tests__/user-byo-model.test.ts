import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  validateByoDefInput,
  createUserByoModelDef,
  setDefAssignments,
  updateUserByoModelDef,
  deleteUserByoModelDef,
  listUserByoModels,
  type UserByoDefInput,
} from "@/lib/user-byo-model";
import { ContractValidationError } from "@/lib/component-runtime-utils";

/**
 * 中央「我的模型库」（user_byo_model_def / assignment）+ 多空间 materialize 集成测试。
 * 需真实 DATABASE_URL（node:test + tsx）。
 *
 * 覆盖：
 *  - 纯函数 validateByoDefInput 的校验分支；
 *  - 创建定义；多空间绑定 → workspace_byo_model 生效行 materialize；
 *  - 单空间单绑定约束（同一空间换绑新定义，旧绑定与旧生效行被替换）；
 *  - 更新定义 → 已绑定空间重新 materialize；
 *  - 删除定义 → 级联清理绑定与生效行（不影响其它定义的绑定）；
 *  - 归属权限：非所有者 / 非本人空间拒绝。
 */

const uid = () => randomUUID().slice(0, 8);
// 测试开关：放行本地 http 目标，避免 SSRF 校验触发 DNS 解析（纯离线）
const prevInsecureLocal = process.env.MODEL_ALLOW_INSECURE_LOCAL;

const OWNER = `user-byo-owner-${uid()}`;
const OTHER = `user-byo-other-${uid()}`;
const WS1 = `ws-byo-1-${uid()}`;
const WS2 = `ws-byo-2-${uid()}`;
const WS_OTHER = `ws-byo-other-${uid()}`;

const BASE_URL = "http://localhost:11434/v1";

function validInput(overrides: Partial<UserByoDefInput> = {}): UserByoDefInput {
  return {
    label: "Test-Model",
    protocol: "OPENAI_COMPATIBLE",
    baseUrl: BASE_URL,
    apiKey: "sk-test-secret",
    capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    contextLimit: 32000,
    priceInputMicrosPerMillion: 1_000_000,
    priceOutputMicrosPerMillion: 4_000_000,
    ...overrides,
  };
}

async function expectByoRejected(
  fn: () => Promise<unknown>,
  code: string,
  hint: string,
): Promise<void> {
  await assert.rejects(
    fn,
    (e: unknown) => e instanceof ContractValidationError && (e as ContractValidationError).code === code,
    `${hint}：应为 ContractValidationError.${code}`,
  );
}

describe("中央模型库 BYO 多空间绑定（定义/绑定/materialize/权限）", () => {
  before(async () => {
    process.env.MODEL_ALLOW_INSECURE_LOCAL = "true";

    await prisma.user.createMany({
      data: [
        { id: OWNER, email: `${OWNER}@zhige.test`, name: OWNER, role: "USER", status: "active", password: "x" },
        { id: OTHER, email: `${OTHER}@zhige.test`, name: OTHER, role: "USER", status: "active", password: "x" },
      ],
      skipDuplicates: true,
    });
    await prisma.workspace.createMany({
      data: [
        { id: WS1, name: WS1, type: "PERSONAL", ownerId: OWNER, updatedAt: new Date() },
        { id: WS2, name: WS2, type: "PERSONAL", ownerId: OWNER, updatedAt: new Date() },
        { id: WS_OTHER, name: WS_OTHER, type: "PERSONAL", ownerId: OTHER, updatedAt: new Date() },
      ],
      skipDuplicates: true,
    });
  });

  after(async () => {
    // 级联清理（assignment 由 def 级联，这里直接按 owner/workspace 兜底）
    await prisma.workspace_byo_model.deleteMany({ where: { workspaceId: { in: [WS1, WS2, WS_OTHER] } } });
    await prisma.user_byo_model_assignment.deleteMany({ where: { workspaceId: { in: [WS1, WS2, WS_OTHER] } } });
    await prisma.user_byo_model_def.deleteMany({ where: { ownerUserId: { in: [OWNER, OTHER] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [WS1, WS2, WS_OTHER] } } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER, OTHER] } } });
    if (prevInsecureLocal === undefined) delete process.env.MODEL_ALLOW_INSECURE_LOCAL;
    else process.env.MODEL_ALLOW_INSECURE_LOCAL = prevInsecureLocal;

    const residue = {
      wsByo: await prisma.workspace_byo_model.count({ where: { workspaceId: { in: [WS1, WS2, WS_OTHER] } } }),
      assign: await prisma.user_byo_model_assignment.count({ where: { workspaceId: { in: [WS1, WS2, WS_OTHER] } } }),
      def: await prisma.user_byo_model_def.count({ where: { ownerUserId: { in: [OWNER, OTHER] } } }),
      ws: await prisma.workspace.count({ where: { id: { in: [WS1, WS2, WS_OTHER] } } }),
      user: await prisma.user.count({ where: { id: { in: [OWNER, OTHER] } } }),
    };
    assert.deepEqual(residue, { wsByo: 0, assign: 0, def: 0, ws: 0, user: 0 }, `零残留断言失败: ${JSON.stringify(residue)}`);
  });

  // ---- 纯函数校验（无 DB） ----
  test("① validateByoDefInput：空展示名拒绝", () => {
    const r = validateByoDefInput({ ...validInput(), label: "  " }, { requireApiKey: true });
    assert.equal(r.ok, false);
  });

  test("② validateByoDefInput：不支持的协议拒绝", () => {
    const r = validateByoDefInput({ ...validInput(), protocol: "FOO" }, { requireApiKey: true });
    assert.equal(r.ok, false);
  });

  test("③ validateByoDefInput：新增要求 API Key 缺失拒绝", () => {
    const r = validateByoDefInput({ ...validInput(), apiKey: "" }, { requireApiKey: true });
    assert.equal(r.ok, false);
  });

  test("④ validateByoDefInput：合法输入通过且能力规范化", () => {
    const r = validateByoDefInput(validInput(), { requireApiKey: true });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.deepEqual(r.data.capabilities, ["TEXT_GENERATION", "STRUCTURED_OUTPUT"]);
      assert.equal(r.data.keepExistingKey, false);
    }
  });

  // ---- 集成流程 ----
  test("⑤ 创建中央定义并持久化", async () => {
    await createUserByoModelDef(OWNER, validInput({ label: "Def-A" }));
    const defs = await listUserByoModels(OWNER);
    assert.equal(defs.length, 1);
    assert.equal(defs[0].label, "Def-A");
    assert.equal(defs[0].hasApiKey, true);
    assert.equal(defs[0].assignments.length, 0);
  });

  test("⑥ 多空间绑定 → workspace_byo_model 生效行 materialize（含 AES 密文、单价、能力）", async () => {
    const def = (await listUserByoModels(OWNER))[0];
    await setDefAssignments(def.id, OWNER, false, [
      { workspaceId: WS1, enabled: true, shareWithMembers: true },
      { workspaceId: WS2, enabled: false, shareWithMembers: false },
    ]);

    // 绑定关系
    const assigns = await prisma.user_byo_model_assignment.findMany({ where: { defId: def.id } });
    assert.equal(assigns.length, 2);

    // 生效行：WS1 启用、WS2 停用
    const ws1 = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: WS1 } });
    const ws2 = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: WS2 } });
    assert.ok(ws1, "WS1 必须 materialize 出生效行");
    assert.ok(ws2, "WS2 必须 materialize 出生效行");
    assert.equal(ws1!.label, "Def-A");
    assert.equal(ws1!.enabled, true);
    assert.equal(ws1!.shareWithMembers, true);
    assert.equal(ws2!.enabled, false);
    // 密钥为密文，非明文
    assert.notEqual(ws1!.apiKeyCipher, "sk-test-secret");
    assert.ok(ws1!.apiKeyCipher.length > 0);
    // 单价透传（微元）
    assert.equal(ws1!.priceInputMicrosPerMillion, 1_000_000);
  });

  test("⑦ 单空间单绑定约束：WS1 改绑到 Def-B，旧绑定与旧生效行被替换", async () => {
    const defA = (await listUserByoModels(OWNER)).find((d) => d.label === "Def-A")!;
    const defB = await createUserByoModelDef(OWNER, validInput({ label: "Def-B", apiKey: "sk-b" }));

    await setDefAssignments(defB.id, OWNER, false, [{ workspaceId: WS1, enabled: true, shareWithMembers: true }]);

    // WS1 在 defA 下的绑定应被清理
    const aBind = await prisma.user_byo_model_assignment.count({ where: { defId: defA.id, workspaceId: WS1 } });
    assert.equal(aBind, 0, "WS1 在 Def-A 下的旧绑定必须被移除");

    // 单空间仍仅一份生效行，且反映 Def-B
    const ws1 = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: WS1 } });
    assert.ok(ws1);
    assert.equal(ws1!.label, "Def-B");
    // WS2 仍由 Def-A 持有
    const ws2 = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: WS2 } });
    assert.equal(ws2!.label, "Def-A");
  });

  test("⑧ 更新定义 → 已绑定空间重新 materialize 新内容", async () => {
    const defB = (await listUserByoModels(OWNER)).find((d) => d.label === "Def-B")!;
    await updateUserByoModelDef(defB.id, OWNER, false, {
      ...validInput({ label: "Def-B-v2", apiKey: "sk-b2", priceOutputMicrosPerMillion: 9_000_000 }),
      keepExistingKey: false,
    });
    const ws1 = await prisma.workspace_byo_model.findUnique({ where: { workspaceId: WS1 } });
    assert.equal(ws1!.label, "Def-B-v2");
    assert.equal(ws1!.priceOutputMicrosPerMillion, 9_000_000);
  });

  test("⑨ 删除定义 → 级联清理自身绑定与生效行，不影响其它定义", async () => {
    const defA = (await listUserByoModels(OWNER)).find((d) => d.label === "Def-A")!;
    const defB = (await listUserByoModels(OWNER)).find((d) => d.label === "Def-B-v2")!;

    await deleteUserByoModelDef(defA.id, OWNER, false);
    // Def-A 的绑定与 WS2 生效行消失
    assert.equal(await prisma.user_byo_model_assignment.count({ where: { defId: defA.id } }), 0);
    assert.equal(await prisma.workspace_byo_model.count({ where: { workspaceId: WS2 } }), 0);
    // Def-B 仍持 WS1 生效行
    assert.equal(await prisma.workspace_byo_model.count({ where: { workspaceId: WS1 } }), 1);

    await deleteUserByoModelDef(defB.id, OWNER, false);
    assert.equal(await prisma.workspace_byo_model.count({ where: { workspaceId: WS1 } }), 0);
    assert.equal((await listUserByoModels(OWNER)).length, 0);
  });

  test("⑩ 权限：非所有者不得更新/删除/设置绑定", async () => {
    const def = await createUserByoModelDef(OWNER, validInput({ label: "Def-Perm" }));
    await expectByoRejected(
      () => updateUserByoModelDef(def.id, OTHER, false, { ...validInput({ label: "x" }), keepExistingKey: true }),
      "FORBIDDEN",
      "非所有者更新",
    );
    await expectByoRejected(() => deleteUserByoModelDef(def.id, OTHER, false), "FORBIDDEN", "非所有者删除");
    await expectByoRejected(
      () => setDefAssignments(def.id, OTHER, false, [{ workspaceId: WS1 }]),
      "FORBIDDEN",
      "非所有者设置绑定",
    );
    // 清理
    await deleteUserByoModelDef(def.id, OWNER, false);
  });

  test("⑪ 权限：不得绑定到非本人拥有的空间", async () => {
    const def = await createUserByoModelDef(OWNER, validInput({ label: "Def-WS" }));
    await expectByoRejected(
      () => setDefAssignments(def.id, OWNER, false, [{ workspaceId: WS_OTHER }]),
      "FORBIDDEN",
      "绑定到他人空间",
    );
    await deleteUserByoModelDef(def.id, OWNER, false);
  });
});
