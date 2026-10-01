import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  parsePricingArgs,
  setModelPricing,
  ModelPricingError,
} from "../../../scripts/set-model-pricing";

describe("模型价格脚本 (set-model-pricing) 安全与参数解析测试", () => {
  describe("CLI 与环境变量参数解析 (parsePricingArgs)", () => {
    const originalEnv = { ...process.env };

    test("未提供 CLI 参数与环境变量时 inputYuan 与 outputYuan 必须为 undefined", () => {
      delete process.env.PRICE_INPUT_YUAN_PER_MILLION;
      delete process.env.PRICE_OUTPUT_YUAN_PER_MILLION;
      delete process.env.PRICE_PROVIDER_NAME;
      delete process.env.PRICE_MODEL_ID;
      delete process.env.PRICE_CURRENCY;

      const res = parsePricingArgs([]);
      assert.equal(res.inputYuan, undefined);
      assert.equal(res.outputYuan, undefined);
    });

    test("支持空格分隔命令行参数: --input 8 --output 40 --provider MagicAI --model gpt-5.5", () => {
      const res = parsePricingArgs(["--input", "8", "--output", "40", "--provider", "MagicAI", "--model", "gpt-5.5"]);
      assert.equal(res.inputYuan, 8);
      assert.equal(res.outputYuan, 40);
      assert.equal(res.provider, "MagicAI");
      assert.equal(res.model, "gpt-5.5");
    });

    test("支持等号分隔命令行参数: --input=12.5 --output=60 --currency=USD", () => {
      const res = parsePricingArgs(["--input=12.5", "--output=60", "--currency=USD"]);
      assert.equal(res.inputYuan, 12.5);
      assert.equal(res.outputYuan, 60);
      assert.equal(res.currency, "USD");
    });

    test("当命令行未指定时，回退从环境变量读取价格配置", () => {
      process.env.PRICE_INPUT_YUAN_PER_MILLION = "15";
      process.env.PRICE_OUTPUT_YUAN_PER_MILLION = "75";

      const res = parsePricingArgs([]);
      assert.equal(res.inputYuan, 15);
      assert.equal(res.outputYuan, 75);

      // 清理环境变量
      delete process.env.PRICE_INPUT_YUAN_PER_MILLION;
      delete process.env.PRICE_OUTPUT_YUAN_PER_MILLION;
    });
  });

  describe("参数安全阻断校验 (setModelPricing Validation)", () => {
    test("缺少 inputYuan 或 outputYuan 时必须抛出 PRICE_INPUT_OUTPUT_REQUIRED 且不执行任何 DB 操作", async () => {
      // 传入一个 mock prismaClient，若被调用则会报错
      const mockPrisma: any = {
        modeldeployment: {
          findUnique: () => {
            throw new Error("UNEXPECTED_DB_CALL: 校验失败前严禁访问数据库！");
          },
        },
      };

      await assert.rejects(
        async () => {
          await setModelPricing({ prismaClient: mockPrisma });
        },
        (err: unknown) => {
          assert.ok(err instanceof ModelPricingError);
          assert.equal(err.code, "PRICE_INPUT_OUTPUT_REQUIRED");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await setModelPricing({ inputYuan: 5, prismaClient: mockPrisma });
        },
        (err: unknown) => {
          assert.ok(err instanceof ModelPricingError);
          assert.equal(err.code, "PRICE_INPUT_OUTPUT_REQUIRED");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await setModelPricing({ outputYuan: 30, prismaClient: mockPrisma });
        },
        (err: unknown) => {
          assert.ok(err instanceof ModelPricingError);
          assert.equal(err.code, "PRICE_INPUT_OUTPUT_REQUIRED");
          return true;
        }
      );
    });

    test("传入负数价格时必须抛出 PRICE_VALUE_INVALID", async () => {
      const mockPrisma: any = {
        modeldeployment: {
          findUnique: () => {
            throw new Error("UNEXPECTED_DB_CALL");
          },
        },
      };

      await assert.rejects(
        async () => {
          await setModelPricing({ inputYuan: -1, outputYuan: 30, prismaClient: mockPrisma });
        },
        (err: unknown) => {
          assert.ok(err instanceof ModelPricingError);
          assert.equal(err.code, "PRICE_VALUE_INVALID");
          return true;
        }
      );
    });
  });

  describe("价格版本递增逻辑 (Version Increment Logic)", () => {
    test("显式更新价格时 priceVersion 必须自增 1 且金额正确转换为微元", async () => {
      let updatedData: any = null;

      const mockPrisma: any = {
        modeldeployment: {
          findUnique: async () => ({
            id: "dep-mock-id",
            providerId: "MagicAI",
            modelId: "gpt-5.5",
          }),
        },
        modelpricing: {
          findUnique: async () => ({
            id: "pricing-old-id",
            deploymentId: "dep-mock-id",
            priceVersion: 3,
            currency: "CNY",
          }),
          update: async ({ data }: any) => {
            updatedData = data;
            return {
              id: "pricing-old-id",
              deploymentId: "dep-mock-id",
              currency: data.currency,
              costInputMicrosPerMillion: data.costInputMicrosPerMillion,
              costOutputMicrosPerMillion: data.costOutputMicrosPerMillion,
              costCacheReadMicrosPerMillion: null,
              costCacheWriteMicrosPerMillion: null,
              priceInputMicrosPerMillion: null,
              priceOutputMicrosPerMillion: null,
              priceCacheReadMicrosPerMillion: null,
              priceCacheWriteMicrosPerMillion: null,
              priceSource: data.priceSource,
              priceStatus: data.priceStatus,
              markupRateBps: null,
              priceVersion: data.priceVersion,
              effectiveFrom: data.effectiveFrom,
            };
          },
        },
      };

      const result = await setModelPricing({
        inputYuan: 6,
        outputYuan: 36,
        prismaClient: mockPrisma,
      });

      assert.ok(updatedData);
      assert.equal(updatedData.priceVersion, 4); // 3 + 1
      assert.equal(updatedData.costInputMicrosPerMillion, 6_000_000);
      assert.equal(updatedData.costOutputMicrosPerMillion, 36_000_000);
      assert.equal(result.row.priceVersion, 4);
      assert.equal(result.snapshot.settlementEnabled, false); // 保持结算禁用
    });
  });
});
