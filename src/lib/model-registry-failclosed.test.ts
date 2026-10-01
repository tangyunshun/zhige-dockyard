import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import {
  resolveDefaultDeployment,
  getPlatformDefaultDeploymentId,
  setPlatformDefaultDeploymentId,
  PLATFORM_DEFAULT_DEPLOYMENT_KEY,
} from "./model-registry";
import { ContractValidationError } from "./component-execution-profile";

/**
 * 平台默认部署 fail-closed 强断言（BILLING-2 开工前补办 2a / 2b）。
 *
 * 背景：曾出现平台默认指向 enabled=false 的 gpt-5.5，导致全站估价 / 执行 403 阻断。
 * 本测试锁定两条不变量：
 *   ① 写入侧：管理员不得把已禁用部署设为平台默认（setPlatformDefaultDeploymentId 必须拒绝）；
 *   ② 运行侧：即便配置因「先设为默认、后被停用」或绕过写入校验而指向已禁用部署，
 *      resolveDefaultDeployment 也必须 fail-closed 拒绝，绝不降级猜测其他部署。
 *
 * 安全措施：
 *   - 全程使用临时 provider / deployment 夹具，after 全量清理；
 *   - 临时改写 systemconfig 后必须立即还原，且 after 再次强制还原为 before 记录的原值，
 *     避免测试失败时把全局默认留在不可用部署上（那会复现全站 403）。
 */
function codeOf(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) return (e as { code?: string }).code;
  return undefined;
}

const PROV = "prov_failclosed_" + randomUUID();
const MODEL_DISABLED = "m_disabled_" + randomUUID();
const WS = "ws_failclosed_" + randomUUID();

let disabledDepId = "";
let originalDefault: string | null = null;

describe("平台默认部署 fail-closed（已禁用部署不得被采用）", () => {
  beforeAll(async () => {
    // 仅为让计划解析可走通；不发起任何真实模型 HTTP 调用
    process.env.MODEL_FAILOPEN_MOCK_KEY = "sk-mock-failclosed";
    originalDefault = await getPlatformDefaultDeploymentId();

    await prisma.modelprovider.create({
      data: {
        id: randomUUID(),
        name: PROV,
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "http://127.0.0.1:9/v1",
        apiKeyEnv: "MODEL_FAILOPEN_MOCK_KEY",
        enabled: true,
      },
    });
    disabledDepId = randomUUID();
    await prisma.modeldeployment.create({
      data: {
        id: disabledDepId,
        providerId: PROV,
        modelId: MODEL_DISABLED,
        upstreamModel: "u-disabled",
        contextLimit: 32000,
        capabilities: ["TEXT_GENERATION"],
        enabled: false, // 关键：已禁用部署
      },
    });
  });

  afterAll(async () => {
    // 强制还原全局默认（无论测试成败），杜绝把配置留在不可用部署上
    try {
      await setPlatformDefaultDeploymentId(originalDefault).catch(async () => {
        // 原值可能已被删除，退化为直接写回，保证不留悬挂
        await prisma.systemconfig.upsert({
          where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY },
          create: {
            key: PLATFORM_DEFAULT_DEPLOYMENT_KEY,
            value: originalDefault ?? "",
          },
          update: { value: originalDefault ?? "" },
        });
      });
    } finally {
      delete process.env.MODEL_FAILOPEN_MOCK_KEY;
      await prisma.modeldeployment.deleteMany({ where: { providerId: PROV } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: PROV } }).catch(() => {});
    }
  });

  it("① 写入侧：把已禁用部署设为平台默认必须被拒绝（MODEL_NOT_ALLOWED）", async () => {
    await expect(() => setPlatformDefaultDeploymentId(disabledDepId)).rejects.toThrowError(
      ContractValidationError,
    );
    // 拒绝后全局默认必须保持原值不变
    expect(await getPlatformDefaultDeploymentId()).toBe(originalDefault);
  });

  it("② 运行侧：配置指向已禁用部署时 resolveDefaultDeployment 必须 fail-closed 拒绝", async () => {
    // 模拟「先设为默认、后被停用」或绕过写入校验直写配置的真实场景
    await prisma.systemconfig.upsert({
      where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY },
      create: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY, value: disabledDepId },
      update: { value: disabledDepId },
    });
    try {
      let caught: unknown = null;
      try {
        await resolveDefaultDeployment({
          workspaceId: WS,
          requiredCapabilities: ["TEXT_GENERATION"],
        });
      } catch (e) {
        caught = e;
      }
      // 必须拒绝：绝不允许解析出任何执行计划（fail-closed，不降级猜测其他部署）
      expect(caught).not.toBeNull();
      expect(codeOf(caught)).toBe("MODEL_NOT_ALLOWED");
    } finally {
      // 立即还原，缩小配置处于不可用状态的窗口
      await prisma.systemconfig.upsert({
        where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY },
        create: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY, value: originalDefault ?? "" },
        update: { value: originalDefault ?? "" },
      });
    }
  });

  it("③ 对照：还原为原平台默认后，不再因「部署已禁用」被拒", async () => {
    if (!originalDefault) {
      // 无平台默认时同样必须明确拒绝，不得猜测
      await expect(
        resolveDefaultDeployment({ workspaceId: WS, requiredCapabilities: ["TEXT_GENERATION"] }),
      ).rejects.toThrowError();
      return;
    }
    let caught: unknown = null;
    try {
      await resolveDefaultDeployment({
        workspaceId: WS,
        requiredCapabilities: ["TEXT_GENERATION"],
      });
    } catch (e) {
      caught = e;
    }
    // 关键断言：不得再因「部署已禁用」而 MODEL_NOT_ALLOWED。
    // 其余错误（如本 vitest 进程未加载供应商密钥 env 导致的鉴权未配置）不属于本测试范畴，
    // 那类失败说明的是环境缺 key，而非 fail-closed 语义回归。
    expect(codeOf(caught)).not.toBe("MODEL_NOT_ALLOWED");
  });
});
